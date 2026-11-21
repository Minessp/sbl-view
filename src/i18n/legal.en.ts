/**
 * Legal and institutional pages (About, Terms, Privacy, Licenses), English. Same shape as PT-BR; section ids (anchors) stay the same.
 */
import type { LegalDoc, LegalPage } from './legal.pt-BR';

const STORAGE_ROWS = [
  ['IndexedDB, database `sbl-view`', 'Training sets, sessions, plans, measurements and preferences', 'Until you delete them in Training → Data'],
  ['localStorage `sbl-theme`', 'Light theme, when chosen', 'Until you change the theme'],
  ['localStorage `sbl-lod`', '3D model quality, when chosen in Settings', 'Until you go back to automatic'],
  ['localStorage `sbl-rest`', 'Rest timer running in the live session', 'Until the rest ends'],
  ['sessionStorage `sbl-chunk-reload`', 'Reload marker after a new version of the site', 'Until you close the tab'],
  ['Browser cache (service worker)', 'The site’s own files, so it opens offline', 'Until the next version of the site'],
] as const;

export const legal: { readonly updated: string; readonly others: string; readonly pages: Record<LegalPage, LegalDoc> } = {
  updated: 'Updated on November 15, 2026.',
  others: 'Other pages',
  pages: {
    about: {
      title: 'About SBL View',
      lead: 'A 3D biomechanics atlas for people who train: the anatomical body, animated exercises and the reason behind each choice, with the source and confidence level of every number.',
      sections: [
        {
          title: 'What it is',
          blocks: [
            'SBL View shows where each muscle attaches, what it does and how its length changes through each exercise. It brings together a body explorer (Atlas), a library of animated exercises, a comparison lab (Lab) and a training log that stays on your device.',
            'SBL stands for science-based lifting: training guided by published evidence. Where the evidence has not arrived yet, the site says it is a hypothesis.',
          ],
        },
        {
          title: 'What it is not',
          blocks: [
            {
              list: [
                'It does not measure your body. The model is a 1.75 m reference body; lengths, moment arms and loads are geometric estimates, not measurements.',
                'It is not medical or physical therapy advice, nor an individual training prescription.',
                'It does not use EMG as proof of hypertrophy. A muscle’s electrical activation and muscle growth are different things.',
                'It does not promise results. The numbers are for comparing trends between exercises.',
              ],
            },
          ],
        },
        {
          id: 'evidencia',
          title: 'How we read the evidence',
          blocks: [
            'Every number in the database carries its source and a confidence seal:',
            {
              list: [
                'Established: backed by studies checked in the primary source.',
                'Probable: supported by studies or by a textbook description, still with gaps.',
                'Speculative: mechanical reasoning or a design choice, not directly tested.',
              ],
            },
            'An exercise marked as a hypothesis is an SBL choice that has not been tested in a study of its own yet; the mechanical reason appears beside it. A reference not yet checked against the original shows as "[to be verified]". No reference is made up: whatever was not found stays marked, not filled in.',
          ],
        },
        {
          title: 'Where the anatomy comes from',
          blocks: [
            'The body is the Z-Anatomy mesh (Gauthier Kervyn and contributors, CC BY-SA 4.0), derived from BodyParts3D (The Database Center for Life Science, CC BY 4.0). The project closed the skin, measured the joint centers and computed the deformation weights and each muscle’s centerline. Muscle paths and lengths come from that mesh.',
          ],
        },
        {
          title: 'Who maintains it',
          blocks: [
            'SBL View is maintained by Minessp. It has no account, server, ads or data collection. Content and reference corrections are welcome through the project repository.',
          ],
        },
      ],
    },
    terms: {
      title: 'Terms of use',
      lead: 'Rules for using SBL View. By using the site, you agree to them.',
      sections: [
        {
          title: 'Use at your own risk',
          blocks: [
            'The content is educational. Training carries a risk of injury; the choice of exercise, load and volume is yours. The site does not know your history, your body or your technique.',
          ],
        },
        {
          title: 'No health advice',
          blocks: [
            'Nothing here is medical, physical therapy or nutrition advice, nor an individual training prescription. In case of pain, injury, pregnancy or any health condition, see a qualified professional before training or changing your training.',
          ],
        },
        {
          title: 'No warranty',
          blocks: [
            'The site is provided as is, with no warranty of accuracy, availability or fitness for a particular purpose. The anatomical model is an estimate; studies may be revised; data stored on the device may be lost if the browser clears its storage. Back up in Training → Data.',
          ],
        },
        {
          title: 'License',
          blocks: [
            'The code is source available for noncommercial use (PolyForm Noncommercial 1.0.0). Original text and data follow CC BY-NC-SA 4.0, and files derived from Z-Anatomy follow CC BY-SA 4.0. Commercial use of the code or the original content requires permission from the rights holder. Details in Licenses and attributions.',
          ],
        },
        {
          title: 'Third-party services',
          blocks: [
            'If the site offers features that depend on an external service you choose, such as generating a plan with an AI provider using your own key, the request goes from your device straight to that provider, under its terms, privacy policy and pricing. SBL View does not broker, store or pay for those requests.',
          ],
        },
        {
          title: 'Changes',
          blocks: ['These terms may change. The date at the end of the page shows the version in force; continuing to use the site after a change counts as acceptance.'],
        },
      ],
    },
    privacy: {
      title: 'Privacy',
      lead: 'SBL View has no account, tracking cookie or analytics. What you log stays on your device.',
      sections: [
        {
          title: 'What stays on the device',
          blocks: [
            'The site stores in the browser only what it needs to work. None of it is sent to any server:',
            { table: { head: ['Where', 'What', 'For how long'], rows: STORAGE_ROWS } },
          ],
        },
        {
          title: 'How to delete it',
          blocks: [
            'Training → Data deletes the Training logs. To delete everything, including theme, quality and cache, clear the site’s data in the browser settings.',
            'The backup is a JSON file you download and keep wherever you like. It only comes back to the site if you import it yourself.',
          ],
        },
        {
          title: 'What leaves the device',
          blocks: [
            'When you open the site, the browser requests its files from the host, as with any website. The hosting service may log technical data about that request (IP address, browser, page, time) under its own policy. SBL View adds no tracking, pixel, ads or usage analytics to that request.',
            'Fonts, libraries and the 3D model come from the site’s own address: no third-party call happens while browsing.',
          ],
        },
        {
          title: 'Features with an external service',
          blocks: [
            'When a feature uses a provider you choose (for example, an AI plan with your key), this page will list what is sent, to whom and when. It only acts when you ask.',
          ],
        },
      ],
    },
    licenses: {
      title: 'Licenses and attributions',
      lead: 'Three licenses cover different parts of SBL View. Rights holder: Minessp, 2026.',
      sections: [
        {
          title: 'In plain language',
          blocks: [
            {
              table: {
                head: ['Part', 'License', 'Commercial use'],
                rows: [
                  ['Code (components, engine, 3D scene, styles, scripts)', 'PolyForm Noncommercial 1.0.0', 'Not allowed without permission'],
                  ['Original data and text (muscles, movements, exercises, clips, interface text)', 'CC BY-NC-SA 4.0', 'Not allowed without permission'],
                  ['Derived from Z-Anatomy (meshes, body images, muscle centerlines)', 'CC BY-SA 4.0', 'Allowed by the original license'],
                ],
              },
            },
            {
              list: [
                'You may, free of charge and without asking: use, study, modify and redistribute for noncommercial purposes (personal use, study, research, teaching, charitable, educational and research institutions, and public bodies).',
                'You may not without written permission: sell copies, charge for access, show ads or include the code or the original content in a paid product or service.',
                'Every copy carries the notice "Required Notice: Copyright (c) 2026 Minessp" and the license address.',
                'Files derived from Z-Anatomy follow the original CC BY-SA 4.0, whose ShareAlike clause does not allow added restrictions.',
              ],
            },
            'How to attribute: SBL View, by Minessp. Code under PolyForm Noncommercial 1.0.0; content under CC BY-NC-SA 4.0; anatomical model derived from Z-Anatomy, CC BY-SA 4.0.',
            'Numbers cited from scientific papers are facts accompanied by their reference; the license covers the selection, the arrangement and the text, not the facts.',
          ],
        },
        {
          title: 'Anatomical model',
          blocks: [
            'Z-Anatomy, "The libre 3D atlas of anatomy", Gauthier Kervyn and contributors, CC BY-SA 4.0. Derived from BodyParts3D 4.0, © The Database Center for Life Science, CC BY 4.0.',
            'Changes: only the right side and the midline are stored (the left is mirrored in the browser); skin closed, with the urogenital and anal regions removed; coordinates converted and scaled to 1.75 m; four levels of detail; deformation weights, centerline and radial vector of the muscles computed by the project; positions quantized and compressed. Pieces of the source repository with their own license (inner ear, kidney, cranial nerves, brain) are not used.',
          ],
        },
        {
          title: 'Typeface',
          blocks: ['Archivo (variable), Omnibus-Type, SIL Open Font License 1.1. Bundled with the site.'],
        },
        {
          title: 'Libraries',
          blocks: [
            {
              table: {
                head: ['Library', 'License'],
                rows: [
                  ['React, react-dom', 'MIT'],
                  ['three.js', 'MIT'],
                  ['@react-three/fiber, @react-three/drei', 'MIT'],
                  ['meshoptimizer (decoder)', 'MIT'],
                  ['Zustand', 'MIT'],
                  ['Dexie', 'Apache-2.0'],
                  ['Lenis', 'MIT'],
                  ['Motion', 'MIT'],
                  ['Zod', 'MIT'],
                  ['d3-scale, d3-shape', 'ISC'],
                  ['Lucide (icons)', 'ISC'],
                  ['wouter', 'Unlicense'],
                  ['GSAP with ScrollTrigger', 'Standard "No Charge" License (GreenSock/Webflow)'],
                ],
              },
            },
            'GSAP does not have an open license; the vendor’s terms allow free use. It is used only in the "Live" chapter of the home page.',
          ],
        },
        {
          title: 'Scientific references',
          blocks: [
            'Every number carries its reference beside it. Segment masses and centers of mass: de Leva (1996). Muscle origin, insertion and action: textbook description, with OpenStax Anatomy and Physiology 2e (CC BY 4.0) as the cited source, in rewritten text.',
          ],
        },
      ],
    },
  },
};
