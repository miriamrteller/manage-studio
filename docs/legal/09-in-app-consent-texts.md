> **Draft, not legal advice. Have an Israeli lawyer review before publishing.**
> **טיוטה, לא ייעוץ משפטי. יש להעביר לבדיקת עורך/ת דין ישראלי/ת לפני פרסום.**
> Bilingual file. Short texts for checkboxes and attestations. `{{…}}` = filled by the app; `[[…]]` = filled by the owner/studio. Every checkbox here is **unticked by default**.

# In-app Consent Texts / נוסחי הסכמה באפליקציה

## 1. Enrolment: terms + privacy (required) / הרשמה: תקנון ופרטיות (חובה)

- EN: ☐ I have read and agree to the [Enrolment Terms]({{terms_url}}) and have read the [Privacy Policy]({{privacy_url}}).
- HE: ☐ קראתי ואני מסכים/ה ל[תנאי ההרשמה]({{terms_url}}), וקראתי את [מדיניות הפרטיות]({{privacy_url}}).

*Note: agreeing to terms and reading the privacy notice are different acts — keep "agree" for terms and "read" for privacy. Do not bundle marketing or photo consent into this box.*

**Studio signup (OpalSwift) / הרשמת סטודיו**

- EN: ☐ I agree to the OpalSwift [Terms of Service]({{platform_terms_url}}) and [Data Processing Agreement]({{dpa_url}}), and have read the [Privacy Policy]({{opalswift_privacy_url}}).
- HE: ☐ אני מסכים/ה ל[תנאי השימוש]({{platform_terms_url}}) ול[הסכם עיבוד המידע]({{dpa_url}}) של OpalSwift, וקראתי את [מדיניות הפרטיות]({{opalswift_privacy_url}}).

## 2. Photo / media consent (optional, per purpose) / הסכמה לצילום ומדיה (רשות, לפי מטרה)

Heading / כותרת:
- EN: **Photos and video (optional).** Taking part does not depend on this. You can change it at any time.
- HE: **צילום ווידאו (רשות).** ההשתתפות אינה תלויה בכך. אפשר לשנות בכל עת.

Options / אפשרויות:
- EN: ☐ The studio may photograph/film {{student_name}} in class and at performances for **internal use** (teaching, feedback).
- HE: ☐ הסטודיו רשאי לצלם את {{student_name}} בשיעורים ובמופעים ל**שימוש פנימי** (הוראה, משוב).
- EN: ☐ …and share them in the **class parents' group** / private gallery for families.
- HE: ☐ …ולשתף אותם ב**קבוצת ההורים של הקבוצה** / בגלריה פרטית למשפחות.
- EN: ☐ …and publish them on the studio's **website and social media** (no full name shown).
- HE: ☐ …ולפרסם אותם ב**אתר וברשתות החברתיות** של הסטודיו (ללא ציון שם מלא).

For minors, add above the options / לקטינים, להוסיף מעל האפשרויות:
- EN: I give this consent as the parent/legal guardian of {{student_name}}.
- HE: אני נותן/ת הסכמה זו כהורה/אפוטרופוס של {{student_name}}.

Photography portfolio (see 07c) / תיק עבודות צילום:
- EN: ☐ The photographer may use selected images from this shoot in their portfolio, website and social media. *(If minors appear: I am their parent/guardian or have the guardian's consent.)*
- HE: ☐ הצלם/ת רשאי/ת להשתמש בתמונות נבחרות מהצילום בתיק העבודות, באתר וברשתות החברתיות. *(אם מופיעים קטינים: אני ההורה/האפוטרופוס שלהם או שקיבלתי את הסכמת האפוטרופוס.)*

*Today the app has two booleans, `photo_consent` and `media_consent`, labelled "I consent to photography" / "I consent to media use" (`apps/web/src/i18n/*.json`, `pages.people.*`). Recommend the per-purpose texts above and a stored timestamp and wording version.*

## 3. Marketing opt-in / הסכמה לדיוור

See [08-marketing-consent.md](08-marketing-consent.md) §3. Short version / נוסח קצר:
- EN: ☐ Send me news and offers by ☐ email ☐ SMS ☐ WhatsApp. I can unsubscribe at any time.
- HE: ☐ שלחו לי עדכונים והצעות ב ☐ דוא"ל ☐ SMS ☐ וואטסאפ. אפשר להסיר את עצמי בכל עת.

## 4. Health declaration attestation / אישור הצהרת בריאות

- EN: ☐ To the best of my knowledge the information in this health declaration is correct and complete. I will tell the studio about any change.
- HE: ☐ למיטב ידיעתי המידע בהצהרת הבריאות נכון ומלא. אעדכן את הסטודיו על כל שינוי.

Guardian line (minor) / שורת אפוטרופוס (קטין/ה) — the app already shows a similar text (`enrolment.waiver_guardian_confirm`):
- EN: ☐ I confirm I am the parent or legal guardian of {{student_name}} and am authorised to sign on their behalf.
- HE: ☐ אני מאשר/ת שאני ההורה או האפוטרופוס החוקי של {{student_name}} ומוסמך/ת לחתום בשמו/ה.

## 5. Contract / waiver e-signature attestation / אישור חתימה אלקטרונית על חוזה / כתב ויתור

Shown with the typed-name field / מוצג ליד שדה השם:
- EN: Type your full name to sign. ☐ I have read the whole document above, I agree to it, and I understand that typing my name and ticking this box is my electronic signature and has the same effect as signing by hand.
- HE: הקלידו את שמכם המלא לחתימה. ☐ קראתי את כל המסמך שלמעלה, אני מסכים/ה לו, ואני מבין/ה שהקלדת שמי וסימון תיבה זו הם החתימה האלקטרונית שלי ותוקפם כחתימה בכתב יד.

Photography contracts (one tick, no scroll; the full contract opens from a link; the client may pay before signing) / חוזה צילום (סימון אחד, ללא גלילה; החוזה המלא נפתח מקישור; אפשר לשלם לפני החתימה) [[LAWYER: confirm]]:
- EN: ☐ I have read and agree to the contract, my details above are correct, and I understand that typing my name and ticking this box is my electronic signature.
- HE: ☐ קראתי את החוזה ואני מסכים/ה לו, הפרטים שלמעלה נכונים, ואני מבין/ה שהקלדת שמי וסימון תיבה זו הם החתימה האלקטרונית שלי.

Every other signed form: class waivers, health declarations, studio forms (one tick, no scroll; the full form opens from a link; the minor guardian line above stays its own tick) / כל טופס חתום אחר: כתבי ויתור, הצהרות בריאות, טפסי הסטודיו (סימון אחד, ללא גלילה; הטופס המלא נפתח מקישור; שורת האפוטרופוס לקטין/ה נשארת סימון נפרד) [[LAWYER: confirm]]:
- EN: ☐ I have read and agree to this form, my details above are correct, and I understand that typing my name and ticking this box is my electronic signature. (Dance studios say "this health declaration" instead of "this form".)
- HE: ☐ קראתי את הטופס ואני מסכים/ה לו, הפרטים שלמעלה נכונים, ואני מבין/ה שהקלדת שמי וסימון תיבה זו הם החתימה האלקטרונית שלי. (בסטודיו למחול: "קראתי את הצהרת הבריאות ואני מאשר/ת אותה".)

After signing / לאחר החתימה:
- EN: Signed by {{signed_by_name}} on {{signed_at}}. A PDF copy has been sent to {{email}}.
- HE: נחתם על ידי {{signed_by_name}} בתאריך {{signed_at}}. עותק PDF נשלח אל {{email}}.

### What level of signature is this? / מה רמת החתימה?

**EN.** The Electronic Signature Law 5761-2001 defines three levels: **electronic signature** (any electronic sign attached to a message), **secure electronic signature** (unique to the signer, identifies them, created by means under the signer's sole control, and shows later changes), and **certified electronic signature** (a secure signature backed by a certificate from a licensed certification authority). The app's **typed name + checkbox** is a **simple electronic signature**. The app adds strong supporting evidence — exact wording snapshot and its SHA-256 hash, a rendered PDF and its hash, an HMAC seal over the record kept with a key outside the database, timestamp, IP, browser, the time the text was shown (no scroll-to-read since 13 Nov 2026, row 42 [[LAWYER: confirm]]), guardian declaration and, if enabled, a one-time SMS code — but it is still not a *secure* or *certified* signature as defined, because the means of signing is not uniquely under the signer's control and there is no certificate. This is normally enough for consumer contracts, enrolment terms, waivers and consents, which the law does not require to be signed in a specific form; its weight is a question of evidence. Where a law requires a signature or a written document (for example the written-form requirement for a copyright transfer or exclusive licence, Copyright Law §37), check with a lawyer whether this level is sufficient. The 2018 amendment (No. 3) replaced §3 on admissibility — [[LAWYER: confirm current §§2–3A]].

**HE.** חוק חתימה אלקטרונית, התשס"א-2001, מגדיר שלוש רמות: **חתימה אלקטרונית** (כל סימן אלקטרוני המצורף למסר), **חתימה אלקטרונית מאובטחת** (ייחודית לחותם, מזהה אותו, נוצרת באמצעי שבשליטתו הבלעדית ומאפשרת לזהות שינוי לאחר החתימה), ו**חתימה אלקטרונית מאושרת** (חתימה מאובטחת עם תעודה מגורם מאשר רשום). **שם מוקלד + תיבת סימון** באפליקציה הוא **חתימה אלקטרונית פשוטה**. האפליקציה מוסיפה ראיות תומכות חזקות — עותק מדויק של הנוסח וטביעת SHA-256 שלו, קובץ PDF וטביעתו, חותם HMAC על הרשומה במפתח השמור מחוץ למסד הנתונים, מועד, IP, דפדפן, מועד הצגת הטקסט (ללא אישור גלילה מאז 13 בנובמבר 2026, שורה 42 [[LAWYER: confirm]]), הצהרת אפוטרופוס, ואם הופעל — קוד SMS חד-פעמי — אך זו עדיין אינה חתימה *מאובטחת* או *מאושרת* כהגדרתן, כי אמצעי החתימה אינו בשליטה בלעדית של החותם ואין תעודה. בדרך כלל זה מספיק לחוזים צרכניים, תנאי הרשמה, כתבי ויתור והסכמות, שהדין אינו מחייב לחתום עליהם בצורה מסוימת; משקלה הוא שאלה ראייתית. היכן שחוק דורש חתימה או מסמך בכתב (למשל דרישת הכתב להעברת זכות יוצרים או לרישיון ייחודי, חוק זכות יוצרים סעיף 37), יש לבדוק עם עו"ד אם רמה זו מספיקה. תיקון מס' 3 (2018) החליף את סעיף 3 בעניין קבילות — [[עו"ד: לאשר את נוסח סעיפים 2–3א העדכני]].

---

### Sources / מקורות
- Electronic Signature Law 5761-2001, §1 (definitions of the three levels), §§2–3A (signature requirement; admissibility, as replaced by Amendment No. 3, 2018). / חוק חתימה אלקטרונית, התשס"א-2001.
- Copyright Law 5768-2007, §37.
- Privacy Protection Law 5741-1981, §11 (notice), §2(6) (image use).
- Communications Law §30A.
- Legal Capacity and Guardianship Law 5722-1962, §14.
- App facts: `supabase/migrations/20260608001200_waiver_evidence.sql`, `supabase/functions/accept-waiver/index.ts`, `apps/web/src/features/enrolment/components/WaiverStep.tsx`.
