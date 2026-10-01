# Midcentury expansion review

- Scope: 151 new nodes from recordings dated 1940-1989: 147 performers/ensembles and four genre anchors.
- Primary evidence: [Library of Congress National Recording Registry](https://www.loc.gov/programs/national-recording-preservation-board/recording-registry/complete-national-recording-registry-listing/). Each performer has an individually named recording and year in `brain/scripts/curated-midcentury.mjs`.
- Year semantics: `eraStart` is the earliest documented recording selected for this batch, not birth, formation, career start or genre origin.
- Connection semantics: the genre edge places a performer by that recording's documented category or adjacent musical tradition. It is not a claim that one genre influenced another. The seven collaboration links are shared recording credits, not inferred meetings.
- Patti Smith's punk link is additionally supported by her [Rock & Roll Hall of Fame profile](https://rockhall.com/inductees/patti-smith/).
- The four new genre anchors are Latin music, spoken word, film score and hip-hop. Their years are representative registry recordings, not origin claims.
- Existing entities were checked by both ID and label. The project-owner exclusion list was checked; U2 was removed from this batch.
- This batch is local only. Do not sync the new graph to Supabase until the same graph and layouts are deployed together; a stale static timeline would otherwise misplace the new nodes.
