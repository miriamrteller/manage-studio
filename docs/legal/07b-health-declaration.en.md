> **Draft, not legal advice. Have an Israeli lawyer review before publishing.**
> Hebrew version: [07b-health-declaration.he.md](07b-health-declaration.he.md).
> Load into the app as a `consent_templates` row per version (child / adult). Replaces the current seed "Health & Liability Waiver" — see note at the end.

# Health Declaration for Dance Classes

## What the law requires (plain summary for the owner)

- **Sports Law 5748-1988** requires medical examinations / health declarations for *athletes* who take part in competitive sport and for students of *recognised training institutions* (for example coaching courses). Ordinary, non-competitive dance or movement classes for children and adults are **not** covered by those rules as far as we could find. **If the school enters students in competitions run by a recognised sports association, the Sports Law may apply — verify with lawyer.**
- **Gyms Law** (Gyms (Licensing and Supervision) Law 5754-1994) health-declaration rules apply to licensed gyms, not to a dance studio — verify if the studio also offers gym-type training (e.g. pilates with machines).
- So, for Creative Ballet Academy, a health declaration is **good practice, not a statutory form**. It helps keep students safe and shows the studio acted reasonably (duty of care under the Torts Ordinance [New Version], negligence §§35–36).
- Health information is **especially sensitive** under the Privacy Protection Law as amended: ask only what is needed, limit who sees it, and delete it after the retention period.
- **Do not combine it with a liability waiver.** A clause releasing the studio from liability for its own negligence is presumed unfair in a standard contract (Standard Contracts Law §4(1)), and a parent's waiver of a child's own future claims is doubtful — verify with lawyer. Photo consent must also be **separate**.

---

## Version A — Child (signed by parent or legal guardian)

**Student:** [[full name]] · Date of birth: [[ ]] · Class: [[ ]]

**1. Questions** (tick yes/no; if "yes", add a short note)

1. Has a doctor ever said the student has a heart condition, or should only do physical activity under medical supervision?
2. In the last 6 months, has the student had chest pain, fainting, or loss of balance from dizziness during or after exercise?
3. Does the student have asthma, epilepsy, diabetes or another condition that may need a response during class?
4. Has the student had an injury, fracture or surgery in the last 6 months, or have a joint, back or bone problem?
5. Does the student have an allergy (food, medication, insect stings) that teachers should know about? Does the student carry an EpiPen or inhaler?
6. Does the student take regular medication that may affect physical activity?
7. Is there anything else (physical, emotional or learning-related) that would help the teacher support the student? *(optional)*

**2. Declaration**

- To the best of my knowledge the answers are correct and complete.
- If I answered "yes" to questions 1–4, I will consult the student's doctor, and the studio may ask for a doctor's note before the student takes part.
- I will tell the studio promptly about any change in the student's health.

**3. Emergency**

- Emergency contacts: [[name, relation, phone]] ×2.
- In an emergency, if I cannot be reached, I authorise the studio staff to call emergency services (מד"א 101) and to give basic first aid until help arrives.

**4. Signature**

☐ I confirm that I am the parent or legal guardian of the student and am authorised to sign for them.
Full name: [[typed]] · Date and time: [[auto]]

---

## Version B — Adult student (18+)

Same questions 1–6 as above, asked about "you". Question 6 wording for adults: *"Do you take regular medication, or has a doctor advised you that a current health condition limits physical activity?"*

Declaration: same as section 2, in first person. Emergency contact: one person. Signature: typed full name + date/time.

---

## Privacy notice (shown above the form)

The studio ([[STUDIO NAME]]) collects this information to keep the student safe in class. Only the studio manager and the student's teachers can see it. You are not legally required to give it, but we cannot accept the student into class without a completed declaration ([[STUDIO: confirm]]). We keep it for the season and [[1 year]] after, then delete it. You may see and correct it at any time. See our Privacy Policy.

---

## Note on the current app text

The seeded template "Health & Liability Waiver" (`supabase/seed.sql`, consent template `…0801`) combines a health declaration, an assumption-of-risk clause, a **release of liability and indemnity**, emergency authorisation and a **photo/media release**. Recommended: split into (1) this health declaration, (2) a separate optional photo/media consent ([09-in-app-consent-texts](09-in-app-consent-texts.md)), and (3) drop or rewrite the release/indemnity with a lawyer. No code change is made in this PR.

### Sources relied on
- Sports Law 5748-1988 (medical examination and health-declaration provisions for athletes / recognised training institutions) — *scope as applied to dance: verify with lawyer.*
- Gyms (Licensing and Supervision) Law 5754-1994 (and its amendment on health declarations) — applies to gyms.
- Torts Ordinance [New Version], §§35–36 (negligence, duty of care).
- Standard Contracts Law 5743-1982, §4(1) (exemption from liability presumed unfair).
- Legal Capacity and Guardianship Law 5722-1962, §14 (parents as natural guardians).
- Privacy Protection Law 5741-1981 as amended by Amendment 13 (information of special sensitivity; §11 notice).
