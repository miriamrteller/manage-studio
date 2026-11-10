// Search and link-preview text for each marketing page, in English and Hebrew.
// Built into each page's <head> by scripts/build-seo.mjs (npm run build:seo).
// Only describe features that are live in the app. Keep titles under about 60
// characters and descriptions under about 160.
export const SITE = "https://opalswift.com";
export const SHARE_IMAGE = "og-image.png";

const BUILT = { en: "Built in Israel, in Hebrew and English.", he: "נבנה בישראל, בעברית ובאנגלית." };
const PROJECT = {
  en: `Send quotes, take deposits by pay link and let reminders follow up on late payments. ${BUILT.en}`,
  he: `שולחים הצעת מחיר, גובים מקדמה בקישור לתשלום, והתזכורות עוקבות אחרי מי שמאחר. ${BUILT.he}`,
};
const CLASSES = {
  en: `Parents sign up online, sign the forms and pay. See who has paid and send reminders. ${BUILT.en}`,
  he: `ההורים נרשמים אונליין, חותמים על הטפסים ומשלמים. רואים מי שילם ושולחים תזכורות. ${BUILT.he}`,
};
const BOOKING = {
  en: `Clients book and pay online, and payment reminders follow up for you. ${BUILT.en}`,
  he: `הלקוחות קובעים ומשלמים אונליין, והתזכורות לתשלום עובדות בשבילכם. ${BUILT.he}`,
};

const field = (en, he, kind) => ({
  title: { en: `${en.title} | OpalSwift`, he: `${he.title} | OpalSwift` },
  description: { en: `${en.lead} ${kind.en}`, he: `${he.lead} ${kind.he}` },
});

// file name → { title: {en, he}, description: {en, he} }
export const PAGES = {
  "index.html": {
    title: {
      en: "OpalSwift: quotes, payments and reminders for Israeli businesses",
      he: "OpalSwift: הצעות מחיר, תשלומים ותזכורות לעסקים בישראל",
    },
    description: {
      en: "Quotes, deposits, pay links, payment reminders and online enrolment for self-employed businesses and studios in Israel, in Hebrew and English.",
      he: "הצעות מחיר, מקדמות, קישורי תשלום, תזכורות והרשמה אונליין לעצמאים ולסטודיואים בישראל, בעברית ובאנגלית.",
    },
  },
  "skins.html": {
    title: { en: "Choose your field | OpalSwift", he: "בחרו את התחום שלכם | OpalSwift" },
    description: {
      en: "See how OpalSwift works for your field: photographers, class studios, tutors, trainers, tradespeople and more.",
      he: "ראו איך OpalSwift עובד בתחום שלכם: צלמים, חוגים, מורים פרטיים, מאמנים, בעלי מקצוע ועוד.",
    },
  },
  "photographer.html": field(
    { title: "Software for photographers in Israel", lead: "For photographers." },
    { title: "תוכנה לצלמים: הצעות מחיר, מקדמות ותשלומים", lead: "לצלמים." },
    PROJECT,
  ),
  "classes.html": field(
    { title: "Class management software for studios in Israel", lead: "For class studios." },
    { title: "תוכנה לניהול חוגים וסטודיו", lead: "לחוגים ולסטודיואים." },
    CLASSES,
  ),
  "dance-teacher.html": field(
    { title: "Dance studio software in Israel", lead: "For dance studios." },
    { title: "תוכנה לסטודיו למחול", lead: "לסטודיו למחול." },
    CLASSES,
  ),
  "art-class.html": field(
    { title: "Software for art classes", lead: "For art classes." },
    { title: "תוכנה לחוגי אמנות", lead: "לחוגי אמנות." },
    CLASSES,
  ),
  "music-teacher.html": field(
    { title: "Software for music teachers", lead: "For music teachers." },
    { title: "תוכנה למורי מוזיקה", lead: "למורי מוזיקה." },
    CLASSES,
  ),
  "swim-coach.html": field(
    { title: "Software for swimming coaches", lead: "For swimming coaches." },
    { title: "תוכנה למאמני שחייה", lead: "למאמני שחייה." },
    CLASSES,
  ),
  "private-tutor.html": field(
    { title: "Software for private tutors", lead: "For private tutors." },
    { title: "תוכנה למורים פרטיים", lead: "למורים פרטיים." },
    BOOKING,
  ),
  "personal-trainer.html": field(
    { title: "Software for personal trainers", lead: "For personal trainers." },
    { title: "תוכנה למאמני כושר", lead: "למאמני כושר." },
    BOOKING,
  ),
  "driving-instructor.html": field(
    { title: "Software for driving instructors", lead: "For driving instructors." },
    { title: "תוכנה למורי נהיגה", lead: "למורי נהיגה." },
    BOOKING,
  ),
  "therapist.html": field(
    { title: "Software for therapists and coaches", lead: "For therapists and coaches." },
    { title: "תוכנה למטפלים ולמאמנים", lead: "למטפלים ולמאמנים." },
    BOOKING,
  ),
  "beautician.html": field(
    { title: "Appointments and payments for beauty businesses", lead: "For beauty businesses." },
    { title: "תורים ותשלומים לעסקי יופי", lead: "לעסקי יופי." },
    BOOKING,
  ),
  "workshops.html": field(
    { title: "Software for workshop leaders", lead: "For workshop leaders." },
    { title: "תוכנה למנחי סדנאות", lead: "למנחי סדנאות." },
    PROJECT,
  ),
  "designer.html": field(
    { title: "Software for designers and marketers", lead: "For designers and marketers." },
    { title: "תוכנה למעצבים ולמשווקים", lead: "למעצבים ולמשווקים." },
    PROJECT,
  ),
  "interior.html": field(
    { title: "Software for interior designers", lead: "For interior designers." },
    { title: "תוכנה למעצבי פנים", lead: "למעצבי פנים." },
    PROJECT,
  ),
  "event-planner.html": field(
    { title: "Software for event planners", lead: "For event planners." },
    { title: "תוכנה למפיקי אירועים", lead: "למפיקי אירועים." },
    PROJECT,
  ),
  "trades.html": field(
    { title: "Quotes and payments for tradespeople", lead: "For tradespeople." },
    { title: "הצעות מחיר ותשלומים לבעלי מקצוע", lead: "לבעלי מקצוע." },
    PROJECT,
  ),
  "sofer-stam.html": field(
    { title: "Software for soferei STaM", lead: "For soferei STaM." },
    { title: "תוכנה לסופרי סת״ם", lead: "לסופרי סת״ם." },
    PROJECT,
  ),
  "adviser.html": field(
    { title: "Software for independent advisers", lead: "For independent advisers." },
    { title: "תוכנה ליועצים עצמאיים", lead: "ליועצים עצמאיים." },
    PROJECT,
  ),
};
