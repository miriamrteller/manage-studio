# YPay in OpalSwift: the complete guide

For businesses that take payments through YPay, for example photographers sending deposit and balance pay links. It covers setting up, taking payments, recording cash and bank transfers, receipts and invoices, refunds, and your records.

Menu paths and button names are the English ones in the app. If you use OpalSwift in Hebrew, the table at the end gives the Hebrew names. For photographers, a job is called a **shoot** (menu: **Shoots**).

## 1. Before you start

You need:
- **A YPay account** with a card terminal (סליקה).
- **YPay API access switched on.** YPay charges for this, about ₪50 + VAT a month (check the current price with YPay). OpalSwift can't connect without it.
- **Your YPay client ID and client secret.** In your YPay account, look under the API / integration details. If you can't find them, ask YPay (service@ypay.co.il).
- **Your dealer type:** exempt dealer (עוסק פטור) or licensed dealer (עוסק מורשה). It decides which document YPay issues. Ask your accountant or YPay if unsure.

YPay's own fees apply as usual (card fees, for example 1.6% paid out monthly or 1.9% within 24 hours: check your YPay agreement).

## 2. Connect YPay (about 5 minutes)

1. Go to **Settings → Payment Settings**. Below "How customers pay" is the **Connect YPay** section.
2. Enter your **YPay client ID** and **YPay client secret**, then press **Save YPay details**.
3. Press **Test connection** (it works once the details are saved). You should see "Connected ✓ YPay accepted your details."
   If not, check both details for typos and that API access is switched on in YPay.
4. Under **Which document does YPay issue?**, choose the **Document type**:
   - **Receipt (קבלה)** if you're an exempt dealer;
   - **Tax invoice-receipt (חשבונית מס-קבלה)** if you're a licensed dealer.
   It saves as soon as you choose. If unsure, ask YPay what your account issues. You can change it later.

Until YPay is connected, clients are asked to pay you directly. Nothing is blocked.

## 3. Try it once (recommended)

1. Create a shoot with a small payment request, for example ₪1, with your own name and email as the client.
2. Press **Send pay link**, open the email and pay by card.
3. Check: the request shows **Paid**, an **Invoice** number appears on it, and the email with the document arrives.
4. Press **Record a payment** on a second ₪1 request, choose **Bank transfer**, and check a **Receipt** number appears and the receipt is in YPay.
5. Refund the card ₪1 in YPay, then press **Record refund** in OpalSwift (see section 8).

## 4. Payment requests

On a shoot, open **Payments** and press **Add payment request**.
- **Request type:** **Single amount**, or **Deposit + balance**.
- **Single amount:** enter the **Total**, a **Label** (what the client sees, for example "Wedding album") and the **Due date**.
- **Deposit + balance:** enter the **Total** and the **Deposit %**. You'll see the split, for example "Deposit 500 ILS now · balance 1500 ILS". Set **Deposit due** and **Balance due (shoot date)**. The two requests are named "Deposit" and "Balance".
- **Max card installments:** how many instalments the client may choose (1 = no instalments, up to 36). With deposit + balance, only the balance can be paid in instalments; the deposit is always one payment.
- Press **Create**.

Each request shows a status:

| Status | Meaning |
|---|---|
| Not sent | Created, link not sent yet |
| Link sent | The client has the pay link |
| Paid | Paid by card, or marked paid for cash, bank transfer or Bit / PayBox. After a partial refund it still shows Paid, with "Partly refunded" |
| Cancelled | You cancelled it. Press **Reopen** to use it again |
| Refunded | You recorded a refund |

The top of the Payments section shows **Paid** and **Outstanding** for the shoot.

## 5. Sending the pay link

- **Send pay link** emails it to the client. **Resend link** sends it again.
- The **WhatsApp** icon button (shown when the client has a phone number) opens WhatsApp with a ready message and the link.
- **Copy link** copies just the link, so you can paste it anywhere. The link is also shown under the request.
- Each client needs a **name and email address**: YPay won't take a payment without them.
- To stop a request, press **Cancel**. Press **Reopen** later if needed.

## 6. What your client sees

- The link opens YPay's secure page. They pay by card, choosing instalments if you allowed them.
- YPay emails them the receipt or invoice (in Hebrew).
- In their client page (**My shoots**), under **Payments**, they see what's due, what's paid, and a **Receipt** link (or "Receipt on its way" for a few minutes).
- **Gallery:** if you've added a gallery link to the shoot, it stays hidden until everything is paid. You can press **Release anyway** to open it early, or **Lock again**.

## 7. Cash, bank transfers and Bit / PayBox

- On the payment request, press **Record a payment**. (Until the next release, the live app still calls this button **Mark paid (cash/bank)** / סימון כשולם (מזומן/העברה), and its dialog **Record offline payment**.)
- Choose **Cash**, **Bank transfer** or **Bit / PayBox**, add a note if you like, and press **Record payment**.
- There is no "Email the payer a payment confirmation" tick here: that appears only for studios that don't issue tax documents. With YPay, the receipt YPay emails is the client's confirmation.
- OpalSwift asks YPay to issue the receipt or invoice, with the right payment method and amount. YPay emails it to the client, and its number appears on the request.

## 8. Refunds

YPay doesn't allow refunds from other apps, so a refund has two steps:
1. **Refund the client in YPay** (or by bank transfer). This is where the money moves.
2. **Record it in OpalSwift.** On the paid request, press **Record refund**. Choose **Full refund** (the default: everything left on the payment) or **Partial refund**, add a reason if you like, and press **Record refund** again to confirm. After a full refund the request shows **Refunded**. This button moves no money.

Then **issue the credit document in YPay** (a credit invoice or a negative receipt). OpalSwift can't issue it for you; the refund dialog tells you which credit document applies and where to issue it.

**Partial refunds:** choose **Partial refund** and enter the amount (it starts at what is left, and can't be more). Refund the same amount in YPay first, and issue the credit document there. The request stays **Paid** and shows "Partly refunded" with the amount; **Record refund** stays available while money is left.

## 9. Receipts and invoices

- **Card payments:** YPay issues the document with the payment and emails the client.
- **Cash, bank transfers and Bit / PayBox:** OpalSwift asks YPay to issue the receipt when you mark the request paid (YPay records Bit / PayBox as a payment app).
- **Where to find them:**
  - on the payment request: card payments show "Invoice 123"; cash, bank transfers and Bit / PayBox show "Receipt 123" (the word is the same whichever document type you chose; press it to open the document);
  - in the client's page;
  - in your YPay account.
- **"Invoice pending"** or **"Receipt pending"** means YPay hasn't confirmed it yet. It usually appears within minutes.
- **If a document doesn't arrive:** after 30 minutes OpalSwift emails the studio's administrators. Check your YPay account and issue it there yourself if needed.
- **Documents OpalSwift couldn't get issued** (for example YPay refused a cash receipt) are listed on the **Finance** dashboard under **Payments without a tax document**, with the reason. Issue those in YPay yourself.
- **Refunds:** the credit document is issued in YPay (see section 8).

## 10. Your records

- **Finance dashboard:** net revenue, expenses and profit, payments received and failed payments (last 7 days).
- **Payments log:** every payment, with date, payer, amounts (pretax, VAT, total), status, method, provider and document. Filter by paid date, status, payment reason, provider and payment source; search by payer.
- **Export CSV:** download the log for your accountant (up to 5,000 rows at a time; narrow the filters if there are more).
- **Expenses:** add expenses with the supplier's name and tax ID, and the receipt.

The figures are for managing your business, not a tax return. Your accountant should check them.

## 11. What YPay can't do through OpalSwift

- Refunds: done in YPay, then recorded in OpalSwift.
- Credit documents for refunds: issued in YPay.
- Automatic monthly charges from a saved card. YPay covers one-off payments and instalments only.

## 12. If something goes wrong

| Problem | What to do |
|---|---|
| "Online payments can't be saved yet" | OpalSwift hasn't finished its own set-up. Contact OpalSwift. |
| Test connection fails | Re-enter the client ID and secret, press **Save YPay details**, and check API access is on in YPay. |
| A client can't pay | Check they have a name and email on the shoot. |
| Paid, but no document after 30 minutes | Check your YPay account and the **Finance** dashboard (**Payments without a tax document**). |
| Paid twice by mistake | OpalSwift keeps the first payment on the request and logs the second one, but doesn't show you a warning yet. You'll see both payments in YPay and in the **Payments log**. Refund one in YPay, then tell OpalSwift so the record matches. |
| Wrong document type | Change **Which document does YPay issue?** in Settings. Earlier documents stay as they are: fix them in YPay. |

## Button names in Hebrew

| English | Hebrew |
|---|---|
| Settings → Payment Settings | הגדרות → הגדרות תשלום |
| Connect YPay | חיבור YPay |
| Save YPay details | שמירת פרטי YPay |
| Test connection | בדיקת חיבור |
| Which document does YPay issue? | איזה מסמך YPay מפיקה? |
| Shoots | צילומים |
| Payments | תשלומים |
| Add payment request | הוספת בקשת תשלום |
| Send pay link | שליחת קישור לתשלום |
| Copy link | העתקת קישור |
| Record a payment (until the next release: Mark paid (cash/bank)) | רישום תשלום (עד הגרסה הבאה: סימון כשולם (מזומן/העברה)) |
| Bit / PayBox | ביט / פייבוקס |
| Full refund / Partial refund | החזר מלא / החזר חלקי |
| Record refund | רישום החזר |
