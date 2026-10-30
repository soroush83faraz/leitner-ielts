# Design

World: a paper flashcard box. Warm paper surfaces, deep teal ink, one saffron accent.

## Colour (tokens in `src/theme/tokens.ts`, light and dark)
| Role | Light | Dark |
|---|---|---|
| bg / surface / sunken | #F4EFE6 / #FFFCF6 / #EBE4D6 | #0D1B1E / #14282C / #0A1517 |
| text / muted | #14262B / #4C5D60 | #EEF1EA / #A9BBBA |
| primary (action) | #0E4D57 | #5FC3CC |
| success / danger | #1F7A45 / #B03A28 | #6FCB91 / #F3907A |
| boxes 1-5 | #C4572F #B67A0E #6B8F3F #2F8F8F #0E4D57 | #E5805B #EBAE3F #9CC46F #55B5B5 #7FD0D8 |

Box colours always appear with the box number. Contrast is enforced by `tests/theme.test.ts`.

## Type
- Persian: Vazirmatn 400/500/600/700, line-heights 1.6+ (display 30, title 24, heading 18, body 16, caption 13).
- English headwords: Newsreader (serif), always LTR via `EnText`.

## Shape and space
4/8 spacing scale, radii 8/12/16/24, one surface level (no nested cards), 48dp minimum targets, max content width 640.

## Motion
One moment: content rises 10px and fades with an expo ease-out (`Reveal`, 260ms); instant under reduced motion.

## Signature
`BoxStrip`: five little card boxes with a colour tab, a stack height proportional to the count, and the count in text.
