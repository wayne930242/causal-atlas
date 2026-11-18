import type { LoadedCase } from '../../data/load.ts'
import type { Messages } from '../i18n/messages.ts'
import { useMessages } from '../i18n/messages.ts'
import { Ident, Rich } from '../text/typeset.tsx'

interface StorySentence {
  readonly text: string
  readonly tags: readonly string[]
}

/** The story in paragraphs of two sentences; a sentence named in story_tags carries its variable ids. */
function storyParagraphs(t: Messages, c: LoadedCase): StorySentence[][] {
  const tags = c.data.story_tags?.[t.locale] ?? []
  return t
    .sentences(c.data.story[t.locale])
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .reduce<StorySentence[][]>((paras, text, i) => {
      const own = tags.filter((t) => text.includes(t.sentence.trim())).flatMap((t) => t.variables)
      const sentence = { text, tags: [...new Set(own)] }
      if (i % 2 === 0) paras.push([sentence])
      else paras[paras.length - 1].push(sentence)
      return paras
    }, [])
}

/** A case's story, its variable names typeset and each tagged sentence followed by its ids. */
export function Story({ c }: { readonly c: LoadedCase }) {
  const t = useMessages()
  return (
    <section className="ca-story" aria-label={t.story}>
      {storyParagraphs(t, c).map((p, i) => (
        <p key={i}>
          {p.map((s) => (
            <span key={s.text} className="ca-story-sentence">
              <Rich text={s.text} ids={c.model.byId} narrative />
              {s.tags.length > 0 && (
                <span className="ca-story-tags" aria-label={t.storyTags(t.list(s.tags))}>
                  {s.tags.map((id) => (
                    <span key={id} className="ca-story-tag ca-mono" aria-hidden="true">
                      <Ident id={id} />
                    </span>
                  ))}
                </span>
              )}
            </span>
          ))}
        </p>
      ))}
    </section>
  )
}
