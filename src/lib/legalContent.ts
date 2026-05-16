/**
 * Legal content (Privacy Policy + Terms of Service) shipped as
 * inline strings rather than dynamic translations. Why hardcode:
 *
 *  - Legal text shouldn't go through Google Translate at runtime
 *    (paraphrasing legal copy is how startups get sued).
 *  - The Play Store + App Store require a stable, externally-fetchable
 *    privacy policy URL. These routes serve as that — the content
 *    here is the source of truth.
 *  - English and Georgian are the two locales we own & maintain.
 *    Other UI languages fall back to English; the disclaimer at the
 *    top of every locale points users to the canonical English
 *    version for legal interpretation.
 *
 * Each document carries an `updatedAt` ISO date so users can see when
 * it last changed. Bump it whenever you touch the body — Google Play
 * Store reviews flag stale privacy policies (>12 months).
 */

export const LEGAL_UPDATED = "2026-05-16";

export const PRIVACY_EN = `# Privacy Policy

**Last updated:** ${LEGAL_UPDATED}

Lokali ("we", "us") respects your privacy. This Policy explains what we collect, why, and what we do with it. By using the Lokali app or website, you agree to this Policy.

## 1. What we collect

**Account data.** If you sign up with email, we store your email address and a hashed password. If you sign in with Google, we receive your name, email, and profile photo from Google's OAuth flow. If you use Guest mode, we issue an anonymous user ID and store no personal information.

**Saved tours.** When you save a tour, your selection (place name, language, voice) is stored against your account so it syncs across devices.

**Location.** We request location permission only when you tap the locate button on the Map page. We use it solely to centre the map and compute distances to nearby attractions. Your coordinates are processed in your device and on our servers transiently — we do not store them.

**Usage data.** We log anonymous, aggregated metrics about how many tours are generated and which languages are used. We do not log the contents of the guides or anything that identifies you personally.

## 2. What we do not collect

- We do not sell, rent, or share your personal data with advertisers.
- We do not track you across other apps or websites.
- We do not record audio from your microphone.
- We do not access your contacts, photos, or files outside the app.

## 3. Third-party services

Lokali uses these processors to deliver the service. Each is bound by their own privacy terms:

- **Supabase** (authentication, database): https://supabase.com/privacy
- **Anthropic / Claude API** (AI-generated guide text): https://www.anthropic.com/legal/privacy
- **Microsoft Azure Speech** (voice narration): https://privacy.microsoft.com
- **Google Cloud Translation** (UI translation): https://cloud.google.com/privacy
- **Google Maps / Places** (map tiles, place lookup): https://policies.google.com/privacy
- **Cloudflare** (hosting, CDN): https://www.cloudflare.com/privacypolicy/

We send only the data each service needs to perform its function. We do not give third parties bulk access to your data.

## 4. Your rights

You can:

- **Access** the data we hold about you by emailing lokaliapps@gmail.com.
- **Export** your saved tours and account data on request.
- **Delete** your account from Settings → Account → Delete account. Deletion removes your profile, saved tours, and any session data within 30 days.
- **Object** to any processing you find unjust by contacting us at the email above.

If you are in the EU/EEA, the UK, or California, additional rights apply under GDPR, UK GDPR, and CCPA respectively. We honour them.

## 5. Children

Lokali is not directed at children under 13. We do not knowingly collect data from anyone under 13. If you believe a child has used Lokali without parental consent, email us and we will delete their account.

## 6. Changes

We may update this Policy. The "Last updated" date at the top reflects the most recent revision. Significant changes are notified in-app.

## 7. Contact

Email: lokaliapps@gmail.com
`;

export const PRIVACY_KA = `# კონფიდენციალურობის პოლიტიკა

**ბოლო განახლება:** ${LEGAL_UPDATED}

Lokali ("ჩვენ") პატივს სცემს თქვენს კონფიდენციალურობას. ეს პოლიტიკა აღწერს რას ვაგროვებთ, რატომ და როგორ ვიყენებთ. Lokali-ის გამოყენებით თქვენ ეთანხმებით ამ პოლიტიკას.

## 1. რას ვაგროვებთ

**ანგარიშის მონაცემები.** თუ ელ.ფოსტით რეგისტრირდებით, ვინახავთ თქვენს ელ.ფოსტის მისამართს და hashed პაროლს. Google-ით შესვლისას ვიღებთ თქვენს სახელს, ელ.ფოსტას და ფოტოს Google-ის OAuth-დან. სტუმრის რეჟიმში გაძლევთ ანონიმურ user ID-ს და პერსონალურ ინფორმაციას არ ვინახავთ.

**შენახული ტურები.** ტურის შენახვისას თქვენი არჩევანი (ადგილის სახელი, ენა, ხმა) ინახება თქვენი ანგარიშის წინააღმდეგ, რომ მოწყობილობებს შორის გადაიცეს.

**მდებარეობა.** მდებარეობის ნებართვას ვითხოვთ მხოლოდ მაშინ, როცა რუკის გვერდზე გადააჭერ Locate ღილაკს. ვიყენებთ მხოლოდ რუკის ცენტრირებისთვის და ღირშესანიშნაობების მანძილის გამოსათვლელად. კოორდინატებს მოწყობილობაში და სერვერებზე გარდამავლად ვამუშავებთ — არ ვინახავთ.

**გამოყენების მონაცემები.** ვაგროვებთ ანონიმურ, აგრეგირებულ მეტრიკებს — რამდენი ტური დაგენერირდა, რომელი ენები გამოიყენება. გიდების შინაარსს ან თქვენს იდენტიფიკაციას არ ვწერთ.

## 2. რას არ ვაგროვებთ

- პერსონალურ მონაცემებს არ ვყიდით, არ ვაქირავებთ და არ ვუზიარებთ რეკლამის გამცემებს.
- სხვა აპებში ან საიტებზე არ გადევნებთ.
- მიკროფონიდან ხმას არ ვწერთ.
- აპის გარეთ თქვენს კონტაქტებს, ფოტოებს, ფაილებს არ ვხედავთ.

## 3. მესამე მხარის სერვისები

Lokali იყენებს ამ პროცესორებს:

- **Supabase** (აუტენტიფიკაცია, database): https://supabase.com/privacy
- **Anthropic / Claude API** (AI-გენერირებული ტექსტი): https://www.anthropic.com/legal/privacy
- **Microsoft Azure Speech** (ხმის ნარაცია): https://privacy.microsoft.com
- **Google Cloud Translation** (UI თარგმანი): https://cloud.google.com/privacy
- **Google Maps / Places** (რუკის ფილები, ადგილების ძებნა): https://policies.google.com/privacy
- **Cloudflare** (hosting, CDN): https://www.cloudflare.com/privacypolicy/

თითოეულ სერვისს მხოლოდ აუცილებელ მონაცემებს ვუგზავნით. ნაყარი წვდომა მათ არ აქვთ.

## 4. თქვენი უფლებები

შეგიძლიათ:

- **მოითხოვოთ** მონაცემები, რომელიც ვინახავთ — ელ.ფოსტა: lokaliapps@gmail.com.
- **ექსპორტი** გააკეთოთ თქვენი ტურების და ანგარიშის მონაცემების.
- **წაშალოთ** თქვენი ანგარიში — Settings → Account → Delete account. წაშლის შემდეგ პროფაილი, შენახული ტურები და session-ის მონაცემები 30 დღეში ქრება.
- **გააპროტესტოთ** ნებისმიერი დამუშავება ელ.ფოსტით.

თუ EU/EEA-ში, UK-ში ან კალიფორნიაში ხართ, GDPR / UK GDPR / CCPA-ის დამატებითი უფლებები გვაქვს და ვცემთ პატივს.

## 5. ბავშვები

Lokali არ არის გათვლილი 13 წლის ქვემოთ ბავშვებზე. შეგნებულად მათგან მონაცემებს არ ვაგროვებთ. თუ ფიქრობთ რომ ბავშვმა მშობლის ნებართვის გარეშე გამოიყენა — გვითხარით, ანგარიშს წავშლით.

## 6. ცვლილებები

ამ პოლიტიკას შესაძლოა ვცვალოთ. ზევით მითითებული "ბოლო განახლება" თარიღი ასახავს უახლეს ვერსიას. მნიშვნელოვან ცვლილებებზე აპში გაცნობებთ.

## 7. კონტაქტი

ელ.ფოსტა: lokaliapps@gmail.com
`;

export const TERMS_EN = `# Terms of Service

**Last updated:** ${LEGAL_UPDATED}

These Terms govern your use of Lokali. By using the app you agree to them.

## 1. The service

Lokali is an AI-generated audio guide for travellers. The app provides written and spoken commentary about places worldwide in your chosen language. Guides are generated on demand by AI models and may contain inaccuracies. Do not rely on Lokali for safety-critical information (medical, legal, navigation in remote terrain).

## 2. Your account

You are responsible for keeping your account credentials private. You may not share your account, sublicense it, or use it on behalf of someone else without their consent.

You agree to provide accurate registration information, and to update it if it changes.

## 3. Acceptable use

You agree not to:

- Use Lokali to generate hateful, defamatory, illegal, or harmful content.
- Reverse-engineer the app or attempt to extract private data.
- Use automation to make excessive API calls or scrape generated content.
- Resell guides generated by Lokali without explicit written permission.

We may suspend or terminate accounts that violate these rules.

## 4. AI-generated content

Audio guides are generated by AI (currently Anthropic Claude) and voiced by Azure Speech. AI can occasionally:

- State facts that are out of date or incorrect.
- Mix up similar place names.
- Omit important context.

Treat the guides as a starting point, not as authoritative reference. Lokali is not liable for decisions you make based on AI output.

## 5. Intellectual property

The Lokali brand, app code, and UI design are our intellectual property. AI-generated guide text is yours to use personally (including for travel planning, sharing with friends), but you may not resell it or republish it commercially.

Third-party APIs (Google Maps, Anthropic, Azure) own the underlying data and models — your use is also subject to their terms.

## 6. Limitation of liability

Lokali is provided "as is". To the maximum extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of the app. Our total liability is capped at the amount you paid us in the previous 12 months (often zero — the app is free).

## 7. Changes

We may update these Terms. The "Last updated" date reflects the most recent revision. Continued use after a change means you accept the new Terms.

## 8. Governing law

These Terms are governed by the laws of Georgia (the country), without regard to its conflict-of-laws principles. Disputes are resolved in Tbilisi courts.

## 9. Contact

Email: lokaliapps@gmail.com
`;

export const TERMS_KA = `# გამოყენების წესები

**ბოლო განახლება:** ${LEGAL_UPDATED}

ეს წესები აწესრიგებს Lokali-ის გამოყენებას. აპის გამოყენებით ეთანხმებით მათ.

## 1. სერვისი

Lokali არის AI-გენერირებული აუდიო გიდი ტურისტებისთვის. აპი გაძლევთ წერილობით და ხმოვან კომენტარს ადგილებზე თქვენი არჩეული ენით. გიდები იქმნება მოთხოვნისთანავე AI მოდელებით და შესაძლოა შეიცავდეს უზუსტობებს. არ დაეყრდნოთ Lokali-ს უსაფრთხოებისთვის კრიტიკულ ინფორმაციაში (სამედიცინო, იურიდიული, ნავიგაცია მთიან ადგილებში).

## 2. თქვენი ანგარიში

თქვენ ხართ პასუხისმგებელი ანგარიშის credentials-ის კონფიდენციალურობაზე. ანგარიშის გაზიარება, sub-license-ი ან სხვის ნაცვლად გამოყენება დაუშვებელია.

დარეგისტრირებისას ზუსტი ინფორმაცია მიუთითეთ და ცვლილებისას განაახლეთ.

## 3. დასაშვები გამოყენება

თქვენ ეთანხმებით **არ** გამოიყენოთ Lokali:

- სიძულვილის, ცილისმწამებლური, უკანონო ან მავნე კონტენტის გენერირებისთვის
- აპის reverse-engineer-ისთვის ან პრივატული მონაცემების ამოღების მცდელობისთვის
- API-ის ავტომატური ბუნდოვანი გამოყენებისთვის ან გენერირებული კონტენტის scrape-ისთვის
- Lokali-ის გენერირებული გიდების კომერციული გადაყიდვისთვის წერილობითი ნებართვის გარეშე

ამ წესების დარღვევისას ანგარიშებს ვაჩერებთ ან ვაუქმებთ.

## 4. AI-გენერირებული კონტენტი

აუდიო გიდები გენერირდება AI-ით (ეხლა Anthropic Claude) და ხმოვანდება Azure Speech-ით. AI-ს ხანდახან შეუძლია:

- გაცემული ფაქტი იყოს მოძველებული ან არასწორი
- აერიოს მსგავსი სახელის ადგილები
- გამოტოვოს მნიშვნელოვანი კონტექსტი

გიდი მიიჩნიეთ როგორც საწყისი წერტილი, არა ავტორიტეტული რესურსი. Lokali არ აგებს პასუხს AI-ის output-ის საფუძველზე მიღებულ გადაწყვეტილებებზე.

## 5. ინტელექტუალური საკუთრება

Lokali-ის ბრენდი, კოდი და UI დიზაინი ჩვენი ინტელექტუალური საკუთრებაა. AI-გენერირებული გიდის ტექსტი თქვენ შეგიძლიათ პირადი მიზნებისთვის გამოიყენოთ (ტურის დაგეგმვა, მეგობრებთან გაზიარება), მაგრამ კომერციული გადაყიდვა-ხელახალი გამოქვეყნება დაუშვებელია.

მესამე მხარის API-ები (Google Maps, Anthropic, Azure) თავიანთი მონაცემები და მოდელები საკუთრებაშია — თქვენი გამოყენება ემორჩილება მათ წესებსაც.

## 6. პასუხისმგებლობის შეზღუდვა

Lokali "როგორც არის" გადმოგეცემათ. კანონით დაშვებული მაქსიმუმის ფარგლებში, არ ვაგებთ პასუხს ნებისმიერ არაპირდაპირ, შემთხვევით ან თანმდევ ზიანზე. ჩვენი მთლიანი პასუხისმგებლობა შემოიფარგლება იმ თანხით, რომელიც ბოლო 12 თვეში გადაგვიხადეთ (ჩვეულებრივ ნული — აპი უფასოა).

## 7. ცვლილებები

შესაძლოა ეს წესები განვაახლოთ. "ბოლო განახლება" თარიღი ასახავს უახლეს ვერსიას. ცვლილების შემდეგ აპის გამოყენება ნიშნავს ახალი წესების მიღებას.

## 8. სამართალი

ეს წესები რეგულირდება საქართველოს კანონებით, კოლიზიური ნორმების გათვალისწინების გარეშე. დავები წყდება თბილისის სასამართლოებში.

## 9. კონტაქტი

ელ.ფოსტა: lokaliapps@gmail.com
`;

export function pickLegalContent(
  doc: "privacy" | "terms",
  lang: string,
): string {
  const isGeorgian = lang.toLowerCase().startsWith("ka");
  if (doc === "privacy") return isGeorgian ? PRIVACY_KA : PRIVACY_EN;
  return isGeorgian ? TERMS_KA : TERMS_EN;
}
