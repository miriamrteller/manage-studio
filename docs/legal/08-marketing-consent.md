> **Draft, not legal advice. Have an Israeli lawyer review before publishing.**
> **טיוטה, לא ייעוץ משפטי. יש להעביר לבדיקת עורך/ת דין ישראלי/ת לפני פרסום.**
> Bilingual file: English and Hebrew side by side.

# Marketing Consent Wording / נוסחי הסכמה לדיוור שיווקי

## 1. The rule in short / הכלל בקצרה

**EN.** Under §30A of the Communications Law ("spam law"), an **advertisement** (דבר פרסומת) may be sent by email, SMS, automatic dialling or fax only with the recipient's **prior express consent**, given in writing (including electronically) or in a recorded call. There is a limited exception for an existing customer who gave their details during a purchase, was told they would be used for marketing of similar products/services, and was offered a chance to refuse. Every advertisement must say it is an ad ("פרסומת" at the start / in the subject), identify the sender and contact details, and give an easy way to refuse (unsubscribe). Recipients can sue for statutory damages of up to **₪1,000 per message** without proving harm. **WhatsApp:** treat it like SMS and get the same consent ([[LAWYER: confirm current case law on WhatsApp/instant messages]]).

**HE.** לפי סעיף 30א לחוק התקשורת ("חוק הספאם"), מותר לשלוח **דבר פרסומת** בדוא"ל, ב-SMS, בחיוג אוטומטי או בפקס רק ב**הסכמה מפורשת מראש** של הנמען, בכתב (כולל באופן אלקטרוני) או בשיחה מוקלטת. יש חריג מצומצם ללקוח קיים שמסר את פרטיו במהלך רכישה, קיבל הודעה שהפרטים ישמשו לפרסום מוצרים/שירותים דומים, וניתנה לו הזדמנות לסרב. בכל דבר פרסומת יש לציין שזו פרסומת ("פרסומת" בתחילת ההודעה / בשורת הנושא), את זהות השולח ופרטי הקשר, ודרך פשוטה לסרב (הסרה). נמען רשאי לתבוע פיצוי ללא הוכחת נזק של עד **1,000 ₪ לכל הודעה**. **וואטסאפ:** להתייחס כמו ל-SMS ולקבל אותה הסכמה ([[עו"ד: לאשר את הפסיקה העדכנית לגבי וואטסאפ/מסרים מיידיים]]).

## 2. Service vs. marketing / הודעות שירות לעומת שיווק

| No consent needed (service) / ללא צורך בהסכמה (שירות) | Consent needed (marketing) / נדרשת הסכמה (שיווק) |
|---|---|
| Enrolment / booking confirmation · אישור הרשמה / הזמנה | New season, new classes, workshops · עונה חדשה, חוגים חדשים, סדנאות |
| Class cancelled, schedule change · ביטול שיעור, שינוי מערכת | Discounts, promotions, "bring a friend" · הנחות, מבצעים, "חבר מביא חבר" |
| Payment request, receipt, payment reminder · בקשת תשלום, קבלה, תזכורת תשלום | Mini-session offers, holiday photo shoots · הצעות לצילומי מיני-סשן, צילומי חג |
| Link to sign a waiver / contract · קישור לחתימה על כתב ויתור / חוזה | Newsletter · ניוזלטר |
| Gallery ready, shoot reminder · הגלריה מוכנה, תזכורת לצילום | Request for reviews combined with an offer · בקשה לביקורת בשילוב הצעה |
| Sign-in codes, security notices · קודי כניסה, הודעות אבטחה | Performance ticket sales to the public ([[LAWYER: check if a recital notice to enrolled families is service or ad]]) · מכירת כרטיסים למופע לציבור |

**Rule of thumb / כלל אצבע:** a message that encourages buying something new is marketing, even if sent to existing clients. A service message must not include promotional content. / הודעה שמעודדת לרכוש משהו חדש היא שיווק, גם כשהיא נשלחת ללקוחות קיימים. הודעת שירות לא תכלול תוכן שיווקי.

## 3. Opt-in checkbox texts / נוסחי תיבת הסכמה

Unticked by default. Separate from accepting the terms. Not a condition of service. / לא מסומנת מראש. נפרדת מאישור התקנון. אינה תנאי לקבלת השירות.

**Single checkbox / תיבה אחת**

- EN: ☐ I agree to receive news and offers from [[STUDIO NAME]] by email, SMS and WhatsApp. I can unsubscribe at any time.
- HE: ☐ אני מסכים/ה לקבל עדכונים והצעות מ-[[שם הסטודיו]] בדוא"ל, ב-SMS ובוואטסאפ. אפשר להסיר את עצמי בכל עת.

**Per channel (recommended) / לפי ערוץ (מומלץ)**

- EN: I'd like to receive news and offers from [[STUDIO NAME]] by: ☐ Email ☐ SMS ☐ WhatsApp. I can unsubscribe at any time.
- HE: אשמח לקבל עדכונים והצעות מ-[[שם הסטודיו]] ב: ☐ דוא"ל ☐ SMS ☐ וואטסאפ. אפשר להסיר את עצמי בכל עת.

**OpalSwift (to studio owners) / OpalSwift (לבעלי סטודיו)**

- EN: ☐ Send me OpalSwift product news and tips by email. I can unsubscribe at any time.
- HE: ☐ שלחו לי עדכוני מוצר וטיפים מ-OpalSwift בדוא"ל. אפשר להסיר את עצמי בכל עת.

**Record kept / מה נשמר:** channel(s), timestamp, the exact wording shown, source (form / page), IP — as proof of consent. Today the app stores a single `leads.marketing_consent` boolean only; per-channel, timestamp and wording are not yet stored (see APP-GAPS.md). / ערוץ, מועד, הנוסח המדויק שהוצג, מקור (טופס/עמוד), IP — כהוכחה להסכמה. כיום האפליקציה שומרת רק שדה בוליאני אחד `leads.marketing_consent`.

## 4. Lines for every marketing message / שורות לכל הודעה שיווקית

**Email subject prefix / תחילית בשורת הנושא:** `פרסומת: ` (Hebrew required even in English emails — [[LAWYER: confirm]]).

**Email footer / כותרת תחתונה בדוא"ל**

- EN: You are receiving this because you agreed to hear from [[STUDIO NAME]], [[ADDRESS]], [[PHONE]]. [Unsubscribe]({{unsubscribe_url}}) — or reply "unsubscribe".
- HE: הודעה זו נשלחה אליך כי הסכמת לקבל עדכונים מ-[[שם הסטודיו]], [[כתובת]], [[טלפון]]. [להסרה מרשימת התפוצה]({{unsubscribe_url}}) — או השב/השיבי "הסר".

**SMS / WhatsApp**

- EN: `Ad: [[message]] — [[STUDIO NAME]] [[PHONE]]. To stop, reply STOP or: {{short_unsubscribe_url}}`
- HE: `פרסומת: [[ההודעה]] — [[שם הסטודיו]] [[טלפון]]. להסרה השב/השיבי "הסר" או: {{short_unsubscribe_url}}`

**After unsubscribe (confirmation) / לאחר הסרה (אישור)**

- EN: You have been unsubscribed from [[STUDIO NAME]] marketing. You will still get messages about your classes, bookings and payments.
- HE: הוסרת מרשימת הדיוור של [[שם הסטודיו]]. עדיין יישלחו אליך הודעות על השיעורים, ההזמנות והתשלומים שלך.

Unsubscribe must be free, work by the same channel, and be honoured **promptly** ([[LAWYER: confirm timing]]). / ההסרה תהיה ללא עלות, באותו ערוץ, ותבוצע **מיד** ([[עו"ד: לאשר מועד]]).

---

### Sources / מקורות
- Communications Law (Telecommunications and Broadcasting) 5742-1982, §30A — definitions of "advertisement" and "recipient consent"; existing-customer exception; required marking, sender details and refusal option; statutory damages up to ₪1,000 per message (§30A(i)/(י)). *Sub-section letters: verify with lawyer.* / חוק התקשורת (בזק ושידורים), התשמ"ב-1982, סעיף 30א.
- Secondary sources reviewed: Federation of Israeli Chambers of Commerce legal updates on §30A; published Israeli small-claims rulings on law.co.il. No specific case is cited.
