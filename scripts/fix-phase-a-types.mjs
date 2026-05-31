import fs from 'fs';
import path from 'path';

const replacements = [
  ['ClassSortField', 'OfferingSortField'],
  ['ClassSortOrder', 'OfferingSortOrder'],
  ['ClassFormValues', 'OfferingFormValues'],
  ['EngagementWithClass', 'EngagementWithOffering'],
  ['EnrolmentWithClass', 'EngagementWithOffering'],
  ['FamilySortField', 'AccountSortField'],
  ['LevelSortField', 'CategorySortField'],
  ['FamilyContactFields', 'AccountContactFields'],
  ['FamilyContactUpdate', 'AccountContactUpdate'],
  ['PublicClass', 'PublicOffering'],
  ['Partial<Class>', 'Partial<Offering>'],
  ['Pick<Class,', 'Pick<Offering,'],
  ['Promise<Class>', 'Promise<Offering>'],
  ['useState<Class', 'useState<Offering'],
  ['<Class |', '<Offering |'],
  ['<Class>', '<Offering>'],
  ['<Class,', '<Offering,'],
  [': Class[]', ': Offering[]'],
  ['Class[]', 'Offering[]'],
  ['Partial<Enrolment>', 'Partial<Engagement>'],
  ['Promise<Enrolment>', 'Promise<Engagement>'],
  ['useState<Enrolment', 'useState<Engagement'],
  ['<Enrolment>', '<Engagement>'],
  ['<Enrolment,', '<Engagement,'],
  [': Enrolment', ': Engagement'],
  ['Partial<Family>', 'Partial<Account>'],
  ['useState<Family', 'useState<Account'],
  ['<Family>', '<Account>'],
  ['<Family,', '<Account,'],
  [': Family', ': Account'],
  ['FamilyMember[]', 'AccountMember[]'],
  ['Promise<FamilyMember>', 'Promise<AccountMember>'],
  ['<FamilyMember>', '<AccountMember>'],
  ['<Term>', '<Season>'],
  ['<Term,', '<Season,'],
  ['Term[]', 'Season[]'],
  ['<Level>', '<Category>'],
  ['<Level,', '<Category,'],
  ['<Teacher>', '<Staff>'],
  ['<Teacher,', '<Staff,'],
  ['Teacher[]', 'Staff[]'],
  ['<ClassSession>', '<OfferingSession>'],
  ['<ClassSession,', '<OfferingSession,'],
  ['<ClassRequirement>', '<OfferingRequirement>'],
  ['ClassRequirementWithTemplate', 'OfferingRequirementWithTemplate'],
  ["import { type Class }", "import { type Offering }"],
  ["import { type Enrolment }", "import { type Engagement }"],
  ["import { type Term }", "import { type Season }"],
  ["import { type Level }", "import { type Category }"],
  ["import { type Teacher }", "import { type Staff }"],
  ["import { type ClassSession }", "import { type OfferingSession }"],
  ["import { EnrolmentSchema", "import { EngagementSchema"],
  ["EnrolmentSchema", "EngagementSchema"],
  ["ClassSchema", "OfferingSchema"],
  ["TermSchema", "SeasonSchema"],
  ["LevelSchema", "CategorySchema"],
  ["TeacherSchema", "StaffSchema"],
  ["FamilySchema", "AccountSchema"],
  ["FamilyMemberSchema", "AccountMemberSchema"],
  ["ClassSessionSchema", "OfferingSessionSchema"],
  ["ClassRequirementSchema", "OfferingRequirementSchema"],
  ["PublicClassSchema", "PublicOfferingSchema"],
  ["guardian_role: 'parent'", "guardian_role: 'account_holder'"],
];

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory() && !['node_modules', 'dist'].includes(ent.name)) walk(p, files);
    else if (/\.(ts|tsx)$/.test(ent.name)) files.push(p);
  }
  return files;
}

const root = path.resolve('apps/web/src');
for (const file of walk(root)) {
  let text = fs.readFileSync(file, 'utf8');
  const orig = text;
  for (const [a, b] of replacements) text = text.split(a).join(b);
  if (text !== orig) {
    fs.writeFileSync(file, text);
    console.log('fixed', path.relative(root, file));
  }
}
