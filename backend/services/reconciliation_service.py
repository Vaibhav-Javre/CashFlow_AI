import json
from datetime import datetime
from backend.database import get_db_connection

class ReconciliationService:
    @staticmethod
    def get_reconciliation_dashboard(filter_status='ALL', search_query=''):
        """
        Retrieve reconciliation lists:
        - Unmatched bank transactions
        - Matched transactions with details
        - Open receivables available for matching
        - Open payables available for matching
        - Summary metrics
        """
        conn = get_db_connection()
        cursor = conn.cursor()

        # 1. Fetch transactions (excluding those generated from invoice receipts directly)
        search_filter = ""
        params = []
        if search_query:
            search_filter = " AND (description LIKE ? OR counterparty LIKE ? OR reference_number LIKE ?)"
            q_like = f"%{search_query.strip()}%"
            params.extend([q_like, q_like, q_like])

        cursor.execute(f"""
            SELECT id, title, date, transaction_date, type, category, description,
                   amount, status, payment_status, counterparty, reference_number,
                   invoice_id, bill_id, reconciliation_status
            FROM transactions
            WHERE 1=1 {search_filter}
            ORDER BY date DESC, id DESC LIMIT 100;
        """, tuple(params))
        all_txs = [dict(t) for t in cursor.fetchall()]

        # 2. Fetch open receivables (invoices)
        cursor.execute("""
            SELECT r.id, r.invoice_number, r.customer_name, r.due_date, r.invoice_date,
                   COALESCE(r.invoice_amount, r.amount, 0) as full_amount,
                   COALESCE(SUM(p.amount), 0) as paid_sum,
                   r.status
            FROM receivables r
            LEFT JOIN customer_payments p ON p.invoice_id = r.id
            GROUP BY r.id
            HAVING full_amount > paid_sum;
        """)
        open_receivables = []
        for r in cursor.fetchall():
            d = dict(r)
            full_amt = float(d['full_amount'])
            paid_amt = float(d['paid_sum'])
            d['outstanding_balance'] = max(0.0, round(full_amt - paid_amt, 2))
            open_receivables.append(d)

        # 3. Fetch open payables (bills)
        cursor.execute("""
            SELECT p.id, COALESCE(p.bill_number, p.invoice_number) as bill_number,
                   COALESCE(p.supplier_name, p.vendor_name) as vendor_name,
                   p.due_date, p.bill_date,
                   COALESCE(p.bill_amount, p.amount, 0) as full_amount,
                   COALESCE(SUM(sp.amount), 0) as paid_sum,
                   p.status
            FROM payables p
            LEFT JOIN supplier_payments sp ON sp.bill_id = p.id
            GROUP BY p.id
            HAVING full_amount > paid_sum;
        """)
        open_payables = []
        for p in cursor.fetchall():
            d = dict(p)
            full_amt = float(d['full_amount'])
            paid_amt = float(d['paid_sum'])
            d['outstanding_balance'] = max(0.0, round(full_amt - paid_amt, 2))
            open_payables.append(d)

        # 4. Fetch confirmed reconciliation records
        cursor.execute("""
            SELECT r.id as recon_id, r.transaction_id, r.matched_type, r.matched_record_id,
                   r.match_method, r.confidence_score, r.match_reason, r.status,
                   r.payment_record_id, r.confirmed_at
            FROM reconciliation_records r
            WHERE r.status = 'CONFIRMED';
        """)
        recon_map = {row['transaction_id']: dict(row) for row in cursor.fetchall()}

        conn.close()

        unmatched = []
        matched = []
        suggested = []

        for tx in all_txs:
            tx_id = tx['id']
            recon_info = recon_map.get(tx_id)
            if recon_info or tx.get('reconciliation_status') == 'MATCHED' or tx.get('invoice_id') or tx.get('bill_id'):
                tx['reconciliation_status'] = 'MATCHED'
                tx['reconciliation_info'] = recon_info
                matched.append(tx)
            else:
                # Calculate automatic matching suggestion
                suggestion = ReconciliationService._calculate_match_suggestion(tx, open_receivables, open_payables)
                tx['suggestion'] = suggestion
                if suggestion and suggestion['confidence_score'] >= 65:
                    tx['reconciliation_status'] = 'SUGGESTED'
                    suggested.append(tx)
                else:
                    tx['reconciliation_status'] = 'UNMATCHED'
                    unmatched.append(tx)

        # Apply status filter
        if filter_status == 'UNMATCHED':
            display_txs = unmatched
        elif filter_status == 'SUGGESTED':
            display_txs = suggested
        elif filter_status == 'MATCHED':
            display_txs = matched
        else:
            display_txs = suggested + unmatched + matched

        return {
            "transactions": display_txs,
            "open_receivables": open_receivables,
            "open_payables": open_payables,
            "summary": {
                "total_transactions": len(all_txs),
                "unmatched_count": len(unmatched),
                "suggested_count": len(suggested),
                "matched_count": len(matched),
                "open_receivables_count": len(open_receivables),
                "open_payables_count": len(open_payables)
            }
        }

    @staticmethod
    def _calculate_match_suggestion(tx, open_receivables, open_payables):
        """
        Explainable rule-based matching engine:
        - Inflows match customer receivables
        - Outflows match supplier payables
        - Evaluates exact/close amount, date proximity, reference match, and counterparty match.
        """
        tx_type = tx.get('type', '').upper()
        tx_amt = float(tx.get('amount', 0.0))
        tx_date_str = str(tx.get('transaction_date') or tx.get('date', ''))[:10]
        tx_desc = str(tx.get('description', '')).lower()
        tx_ref = str(tx.get('reference_number', '')).lower()
        tx_party = str(tx.get('counterparty', '')).lower()

        candidates = open_receivables if tx_type == 'INFLOW' else open_payables
        best_candidate = None
        best_score = 0
        best_reasons = []

        for cand in candidates:
            score = 0
            reasons = []
            cand_amt = float(cand.get('outstanding_balance', 0.0))
            cand_num = str(cand.get('invoice_number' if tx_type == 'INFLOW' else 'bill_number', '')).lower()
            cand_name = str(cand.get('customer_name' if tx_type == 'INFLOW' else 'vendor_name', '')).lower()
            cand_due = str(cand.get('due_date', ''))[:10]

            # 1. Amount Match
            amt_diff = abs(tx_amt - cand_amt)
            if amt_diff < 0.01:
                score += 50
                reasons.append(f"Exact amount match (₹{tx_amt:,.2f})")
            elif amt_diff / (cand_amt or 1.0) <= 0.05:
                score += 30
                reasons.append(f"Close amount match (within 5% of ₹{cand_amt:,.2f})")
            elif tx_amt < cand_amt:
                score += 20
                reasons.append(f"Possible partial payment of ₹{cand_amt:,.2f}")

            # 2. Reference / Invoice Number in description or reference
            if cand_num and (cand_num in tx_desc or cand_num in tx_ref):
                score += 30
                reasons.append(f"Document number '{cand_num.upper()}' found in narration/reference")

            # 3. Counterparty Name match
            if cand_name and len(cand_name) > 3:
                # Check tokens
                tokens = [t for t in cand_name.split() if len(t) > 3]
                found_token = any(t in tx_desc or t in tx_party for t in tokens)
                if cand_name in tx_desc or cand_name in tx_party or found_token:
                    score += 25
                    reasons.append(f"Counterparty '{cand_name.title()}' matched")

            # 4. Date Proximity
            try:
                t_dt = datetime.strptime(tx_date_str, '%Y-%m-%d')
                c_dt = datetime.strptime(cand_due, '%Y-%m-%d')
                diff_days = abs((t_dt - c_dt).days)
                if diff_days <= 3:
                    score += 15
                    reasons.append(f"Date within {diff_days} days of due date")
                elif diff_days <= 10:
                    score += 10
                    reasons.append(f"Date within {diff_days} days of due date")
            except Exception:
                pass

            if score > best_score:
                best_score = score
                best_candidate = cand
                best_reasons = reasons

        if best_candidate and best_score >= 40:
            return {
                "matched_type": "receivable" if tx_type == 'INFLOW' else "payable",
                "matched_record_id": best_candidate['id'],
                "matched_record_number": best_candidate.get('invoice_number' if tx_type == 'INFLOW' else 'bill_number'),
                "counterparty_name": best_candidate.get('customer_name' if tx_type == 'INFLOW' else 'vendor_name'),
                "outstanding_balance": best_candidate['outstanding_balance'],
                "confidence_score": min(100, best_score),
                "match_reason": " + ".join(best_reasons)
            }
        return None

    @staticmethod
    def confirm_reconciliation(transaction_id, matched_type, matched_record_id, notes=None):
        """
        Confirm reconciliation match between bank transaction and invoice/bill:
        - Prevents bank transaction from being reconciled twice.
        - Records customer_payment or supplier_payment.
        - Updates receivable or payable status.
        - Updates transactions.reconciliation_status = 'MATCHED'.
        - Prevents double-counting in bank balance (since transaction is already present).
        """
        conn = get_db_connection()
        cursor = conn.cursor()

        # Check transaction
        cursor.execute("SELECT * FROM transactions WHERE id = ?;", (transaction_id,))
        tx = cursor.fetchone()
        if not tx:
            conn.close()
            raise ValueError(f"Transaction #{transaction_id} not found.")

        if tx['reconciliation_status'] == 'MATCHED':
            conn.close()
            raise ValueError("This transaction is already reconciled.")

        tx_amount = float(tx['amount'])
        tx_date = str(tx['transaction_date'] or tx['date'])[:10]
        tx_ref = str(tx['reference_number'] or f"TX-{transaction_id}")

        payment_record_id = None

        if matched_type == 'receivable':
            cursor.execute("SELECT * FROM receivables WHERE id = ?;", (matched_record_id,))
            rec = cursor.fetchone()
            if not rec:
                conn.close()
                raise ValueError(f"Receivable #{matched_record_id} not found.")

            full_amt = float(rec['invoice_amount'] or rec['amount'] or 0.0)
            cursor.execute("SELECT COALESCE(SUM(amount), 0) as paid_sum FROM customer_payments WHERE invoice_id = ?;", (matched_record_id,))
            already_paid = float(cursor.fetchone()['paid_sum'])
            outstanding = max(0.0, round(full_amt - already_paid, 2))

            if outstanding <= 0:
                conn.close()
                raise ValueError(f"Invoice #{rec['invoice_number']} is already fully settled.")

            # Record customer payment
            cursor.execute("""
                INSERT INTO customer_payments (
                    invoice_id, amount, payment_date, payment_method, reference_number, notes
                ) VALUES (?, ?, ?, 'Bank Transfer', ?, ?);
            """, (matched_record_id, min(tx_amount, outstanding), tx_date, tx_ref, notes or f"Reconciled from Bank Tx #{transaction_id}"))
            payment_record_id = cursor.lastrowid

            # Update receivable status
            new_outstanding = max(0.0, round(outstanding - tx_amount, 2))
            new_status = 'PAID' if new_outstanding <= 0.01 else 'PENDING'
            cursor.execute("UPDATE receivables SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;", (new_status, matched_record_id))

            # Link transaction
            cursor.execute("""
                UPDATE transactions
                SET invoice_id = ?, reconciliation_status = 'MATCHED', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?;
            """, (matched_record_id, transaction_id))

        else: # payable
            cursor.execute("SELECT * FROM payables WHERE id = ?;", (matched_record_id,))
            pay = cursor.fetchone()
            if not pay:
                conn.close()
                raise ValueError(f"Payable #{matched_record_id} not found.")

            full_amt = float(pay['bill_amount'] or pay['amount'] or 0.0)
            cursor.execute("SELECT COALESCE(SUM(amount), 0) as paid_sum FROM supplier_payments WHERE bill_id = ?;", (matched_record_id,))
            already_paid = float(cursor.fetchone()['paid_sum'])
            outstanding = max(0.0, round(full_amt - already_paid, 2))

            if outstanding <= 0:
                conn.close()
                raise ValueError("This bill is already fully settled.")

            # Record supplier payment
            cursor.execute("""
                INSERT INTO supplier_payments (
                    bill_id, amount, payment_date, payment_method, reference_number, notes
                ) VALUES (?, ?, ?, 'Bank Transfer', ?, ?);
            """, (matched_record_id, min(tx_amount, outstanding), tx_date, tx_ref, notes or f"Reconciled from Bank Tx #{transaction_id}"))
            payment_record_id = cursor.lastrowid

            # Update payable status
            new_outstanding = max(0.0, round(outstanding - tx_amount, 2))
            new_status = 'PAID' if new_outstanding <= 0.01 else 'PENDING'
            cursor.execute("UPDATE payables SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;", (new_status, matched_record_id))

            # Link transaction
            cursor.execute("""
                UPDATE transactions
                SET bill_id = ?, reconciliation_status = 'MATCHED', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?;
            """, (matched_record_id, transaction_id))

        # Create reconciliation record
        cursor.execute("""
            INSERT INTO reconciliation_records (
                transaction_id, matched_type, matched_record_id, match_method,
                confidence_score, match_reason, status, payment_record_id, confirmed_at, created_at
            ) VALUES (?, ?, ?, 'USER_CONFIRMED', 1.0, ?, 'CONFIRMED', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        """, (transaction_id, matched_type, matched_record_id, notes or "User confirmed reconciliation match", payment_record_id))
        recon_id = cursor.lastrowid

        # Audit trail
        cursor.execute("""
            INSERT INTO reconciliation_audit_history (
                reconciliation_id, transaction_id, action, details, created_at
            ) VALUES (?, ?, 'CONFIRMED', ?, CURRENT_TIMESTAMP);
        """, (recon_id, transaction_id, f"Reconciled Tx #{transaction_id} against {matched_type} #{matched_record_id}."))

        conn.commit()
        conn.close()

        return {
            "reconciliation_id": recon_id,
            "transaction_id": transaction_id,
            "matched_type": matched_type,
            "matched_record_id": matched_record_id,
            "payment_record_id": payment_record_id
        }

    @staticmethod
    def undo_reconciliation(transaction_id):
        """
        Undo a confirmed reconciliation:
        - Removes the created payment record.
        - Restores invoice or bill status.
        - Sets transactions.reconciliation_status = 'UNMATCHED'.
        - Unlinks transaction invoice_id/bill_id.
        - Logs UNDONE to audit trail.
        """
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT * FROM reconciliation_records
            WHERE transaction_id = ? AND status = 'CONFIRMED'
            ORDER BY id DESC LIMIT 1;
        """, (transaction_id,))
        recon = cursor.fetchone()
        if not recon:
            conn.close()
            raise ValueError(f"No active reconciliation record found for Transaction #{transaction_id}.")

        matched_type = recon['matched_type']
        matched_id = recon['matched_record_id']
        pay_id = recon['payment_record_id']

        if matched_type == 'receivable':
            if pay_id:
                cursor.execute("DELETE FROM customer_payments WHERE id = ?;", (pay_id,))
            
            # Recalculate status
            cursor.execute("SELECT COALESCE(invoice_amount, amount, 0) as full_amt, due_date FROM receivables WHERE id = ?;", (matched_id,))
            r_row = cursor.fetchone()
            if r_row:
                full_amt = float(r_row['full_amt'])
                cursor.execute("SELECT COALESCE(SUM(amount), 0) as paid_sum FROM customer_payments WHERE invoice_id = ?;", (matched_id,))
                paid_sum = float(cursor.fetchone()['paid_sum'])
                new_status = 'PAID' if paid_sum >= full_amt else ('OVERDUE' if r_row['due_date'] < datetime.now().strftime('%Y-%m-%d') else 'PENDING')
                cursor.execute("UPDATE receivables SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;", (new_status, matched_id))

        else: # payable
            if pay_id:
                cursor.execute("DELETE FROM supplier_payments WHERE id = ?;", (pay_id,))

            cursor.execute("SELECT COALESCE(bill_amount, amount, 0) as full_amt, due_date FROM payables WHERE id = ?;", (matched_id,))
            p_row = cursor.fetchone()
            if p_row:
                full_amt = float(p_row['full_amt'])
                cursor.execute("SELECT COALESCE(SUM(amount), 0) as paid_sum FROM supplier_payments WHERE bill_id = ?;", (matched_id,))
                paid_sum = float(cursor.fetchone()['paid_sum'])
                new_status = 'PAID' if paid_sum >= full_amt else ('OVERDUE' if p_row['due_date'] < datetime.now().strftime('%Y-%m-%d') else 'PENDING')
                cursor.execute("UPDATE payables SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;", (new_status, matched_id))

        # Unlink transaction
        cursor.execute("""
            UPDATE transactions
            SET invoice_id = NULL, bill_id = NULL, reconciliation_status = 'UNMATCHED', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?;
        """, (transaction_id,))

        # Update reconciliation record status
        cursor.execute("""
            UPDATE reconciliation_records
            SET status = 'REJECTED'
            WHERE id = ?;
        """, (recon['id'],))

        # Audit history
        cursor.execute("""
            INSERT INTO reconciliation_audit_history (
                reconciliation_id, transaction_id, action, details, created_at
            ) VALUES (?, ?, 'UNDONE', ?, CURRENT_TIMESTAMP);
        """, (recon['id'], transaction_id, f"Undid reconciliation for Transaction #{transaction_id}."))

        conn.commit()
        conn.close()

        return {"success": True, "transaction_id": transaction_id, "message": "Reconciliation undone successfully."}
