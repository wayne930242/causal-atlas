import { useEffect, useState } from 'react'
import type { Locale } from '../components/index.ts'
import { CasePage, CausalPlayground, CiteBlock, LANGUAGE_NAMES, LocaleProvider, ModelEditor, Supplement, WorldLanes } from '../components/index.ts'
import { caseIds, getCase } from '../data/index.ts'
import { Explorer } from './explorer/Explorer.tsx'
import { Interactions } from './Interactions.tsx'

interface Route {
  readonly page: 'index' | 'explorer' | 'playground' | 'case' | 'lesson' | 'editor' | 'interactions'
  readonly id: string
  readonly step: number
  /** `lang=en` in the route (`#/case/x?lang=en`) or in the page's query string; default zh-TW. */
  readonly locale: Locale
  /** `theme=dark|light` in the route: the explorer keeps its theme in its address. */
  readonly theme?: 'light' | 'dark'
}

function parse(hash: string, search: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const params = new URLSearchParams(query)
  const step = Number(params.get('step') ?? '1') || 1
  const lang = params.get('lang') ?? new URLSearchParams(search).get('lang')
  const locale: Locale = lang === 'en' ? 'en' : 'zh-TW'
  const parts = path.split('/').filter((p) => p !== '')
  const themeParam = params.get('theme')
  if (parts[0] === 'explorer') {
    return { page: 'explorer', id: 'rock-throwing', step, locale, theme: themeParam === 'dark' || themeParam === 'light' ? themeParam : undefined }
  }
  if (parts[0] === 'interactions') return { page: 'interactions', id: parts[1] ?? 'all', step, locale }
  const id = parts[1] !== undefined && caseIds.includes(parts[1]) ? parts[1] : 'rock-throwing'
  if (parts[0] === 'playground') return { page: 'playground', id, step, locale }
  if (parts[0] === 'case') return { page: 'case', id, step, locale }
  if (parts[0] === 'lesson') return { page: 'lesson', id, step, locale }
  if (parts[0] === 'editor') return { page: 'editor', id, step, locale }
  return { page: 'index', id, step, locale }
}

function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash, window.location.search))
  useEffect(() => {
    const on = (): void => setRoute(parse(window.location.hash, window.location.search))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

/** `?digits=4` in the page's query string: the decimals of every node readout; absent leaves the default. */
function pageDigits(): number | undefined {
  const value = new URLSearchParams(window.location.search).get('digits')
  return value === null ? undefined : Number(value)
}

function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState(() => new URLSearchParams(window.location.search).get('theme') ?? 'light')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))]
}

/** A demo route with `lang=en` added for English; zh-TW leaves it out. */
function href(path: string, locale: Locale, extra = ''): string {
  const query = [extra, locale === 'en' ? 'lang=en' : ''].filter((q) => q !== '').join('&')
  return `#${path}${query === '' ? '' : `?${query}`}`
}

/** The current route in another language, keeping page, case and step. */
function switchHref(route: Route, locale: Locale): string {
  if (route.page === 'explorer') {
    const [path, query = ''] = window.location.hash.replace(/^#/, '').split('?')
    const params = new URLSearchParams(query)
    if (locale === 'en') params.set('lang', 'en')
    else params.delete('lang')
    return `#${path}?${params.toString()}`
  }
  const path =
    route.page === 'index' ? '/' : route.page === 'lesson' || route.page === 'editor' ? `/${route.page}` : `/${route.page}/${route.id}`
  return href(path, locale, route.page === 'case' && route.step > 1 ? `step=${route.step}` : '')
}

const DEMO = {
  'zh-TW': {
    title: 'causal-atlas 示範',
    intro: '元件示範。每個案例有一頁案例頁，也可以在遊樂場裡自己改。',
    playground: '遊樂場',
    casePage: '案例頁',
    lesson: '講義',
    lessonLink: '講義示範：世界分道',
    editor: '自己建模型',
    editorLink: '自己建一個因果模型',
    explorer: '元件瀏覽器',
    explorerLink: '元件瀏覽器：挑元件、調設定、複製寫法',
    pages: '示範頁面',
    case: '案例',
    light: '淺色',
    dark: '深色',
    language: '語言',
    blog: '洪偉的部落格',
    about: '關於作者',
    site: '作者網站',
  },
  en: {
    title: 'causal-atlas demo',
    intro: 'Component demo. Every case has a case page, and you can change it yourself in the playground.',
    playground: 'Playground',
    casePage: 'Case page',
    lesson: 'Lesson',
    lessonLink: 'Lesson demo: world lanes',
    editor: 'Build a model',
    editorLink: 'Build a causal model yourself',
    explorer: 'Explorer',
    explorerLink: 'Explorer: pick a component, tune its props, copy the code',
    pages: 'Demo pages',
    case: 'Case',
    light: 'Light',
    dark: 'Dark',
    language: 'Language',
    blog: "Wei Hung's blog",
    about: 'About the author',
    site: "Author's site",
  },
} as const satisfies Record<Locale, Record<string, string>>

function Index({ locale }: { readonly locale: Locale }) {
  const d = DEMO[locale]
  return (
    <div className="demo-index">
      <h1>causal-atlas</h1>
      <p className="demo-muted">{d.intro}</p>
      <ul>
        {caseIds.map((id) => {
          const c = getCase(id)
          return (
            <li key={id}>
              <a href={href(`/case/${id}`, locale)}>{c.data.title[locale]}</a>
              <a className="demo-muted" href={href(`/playground/${id}`, locale)}>
                {d.playground}
              </a>
            </li>
          )
        })}
      </ul>
      <p>
        <a href={href('/explorer', locale)}>{d.explorerLink}</a>
      </p>
      <p>
        <a href={href('/lesson', locale)}>{d.lessonLink}</a>
      </p>
      <p>
        <a href={href('/editor', locale)}>{d.editorLink}</a>
      </p>
    </div>
  )
}

function LessonZh() {
  return (
    <article className="demo-article">
      <h2>二、如果小蘇的石頭沒打中</h2>
      <p>
        脈絡不變：兩個人還是都丟了。只把 SH 的式子換成 0，其餘變項照原來的式子重算。算出來的世界畫在第二條道，和實際世界對齊。
      </p>
      <WorldLanes caseId="rock-throwing" interventions={{ SH: 0 }} actionLabel="攔下小蘇的石頭" />
      <p>
        兩條道只有 SH 和 BH 兩格不同，最後一格 BS 都是 1。攔下小蘇的石頭，瓶子還是破。所以只問「少了它，結果還會不會發生」，判不出小蘇的石頭是原因。
      </p>
      <Supplement title="反事實的三個步驟：溯因、干預、預測">
        <p>溯因：用看到的事回推外生變項的值。干預：把要改的變項換成常數。預測：用改過的模型重算其餘變項。</p>
      </Supplement>
      <h2>三、把小比的石頭固定住</h2>
      <p>HP 的定義允許先把某些變項固定在實際值，再改原因。第三條道就是這樣算出來的世界。</p>
      <WorldLanes
        caseId="rock-throwing"
        interventions={{ ST: 0 }}
        actionLabel="小蘇沒丟"
        witness={{ cause: 'ST=1', effect: 'BS=1' }}
      />
    </article>
  )
}

function LessonEn() {
  return (
    <article className="demo-article" lang="en">
      <h2>2. If Suzy&apos;s rock had missed</h2>
      <p>
        The context stays the same: both of them still throw. Only the equation for SH becomes 0; every other variable is recomputed from
        its own equation. The world this gives is drawn as a second lane, lined up with the actual world.
      </p>
      <WorldLanes caseId="rock-throwing" interventions={{ SH: 0 }} actionLabel="Stop Suzy's rock" />
      <p>
        The two lanes differ only in SH and BH; the last cell, BS, is 1 in both. Stop Suzy&apos;s rock, and the bottle still breaks. So
        asking only whether the outcome would still occur without it cannot pick out Suzy&apos;s rock as a cause.
      </p>
      <Supplement title="The three steps of a counterfactual: abduction, action, prediction">
        <p>
          Abduction: infer the values of the exogenous variables from what was observed. Action: replace the variables to be changed by
          constants. Prediction: recompute the other variables in the changed model.
        </p>
      </Supplement>
      <h2>3. Holding Billy&apos;s rock fixed</h2>
      <p>
        The HP definition lets us first hold some variables at their actual values and then change the cause. The third lane is the world
        computed this way.
      </p>
      <WorldLanes
        caseId="rock-throwing"
        interventions={{ ST: 0 }}
        actionLabel="Suzy does not throw"
        witness={{ cause: 'ST=1', effect: 'BS=1' }}
      />
    </article>
  )
}

export function App() {
  const route = useRoute()
  const [theme, toggleTheme] = useTheme()
  const { locale } = route
  const d = DEMO[locale]
  const shownTheme = route.page === 'explorer' && route.theme !== undefined ? route.theme : theme
  useEffect(() => {
    document.documentElement.dataset.theme = shownTheme
  }, [shownTheme])
  const flipTheme = (): void => {
    if (route.page !== 'explorer') return toggleTheme()
    const [path, query = ''] = window.location.hash.replace(/^#/, '').split('?')
    const params = new URLSearchParams(query)
    params.set('theme', shownTheme === 'dark' ? 'light' : 'dark')
    window.history.replaceState(null, '', `#${path}?${params.toString()}`)
    window.dispatchEvent(new Event('hashchange'))
  }
  useEffect(() => {
    document.documentElement.lang = locale
    document.title = DEMO[locale].title
  }, [locale])
  const go = (page: 'playground' | 'case', id: string): void => {
    window.location.hash = href(`/${page}/${id}`, locale)
  }
  return (
    <LocaleProvider locale={locale}>
      <div className="demo-shell">
        <header className="demo-bar">
          <a className="demo-brand" href={href('/', locale)}>
            causal-atlas
          </a>
          <nav aria-label={d.pages}>
            <a href={href('/explorer', locale)} aria-current={route.page === 'explorer' ? 'page' : undefined}>
              {d.explorer}
            </a>
            <a href={href(`/playground/${route.id}`, locale)} aria-current={route.page === 'playground' ? 'page' : undefined}>
              {d.playground}
            </a>
            <a href={href(`/case/${route.id}`, locale)} aria-current={route.page === 'case' ? 'page' : undefined}>
              {d.casePage}
            </a>
            <a href={href('/lesson', locale)} aria-current={route.page === 'lesson' ? 'page' : undefined}>
              {d.lesson}
            </a>
            <a href={href('/editor', locale)} aria-current={route.page === 'editor' ? 'page' : undefined}>
              {d.editor}
            </a>
          </nav>
          <span className="demo-spacer" />
          <nav className="demo-site" aria-label={d.site}>
            <a href={locale === 'en' ? 'https://www.wayneh.tw/en/' : 'https://www.wayneh.tw/'}>{d.blog}</a>
            <a href="https://www.wayneh.tw/about/">{d.about}</a>
          </nav>
          {(route.page === 'playground' || route.page === 'case') && (
            <label>
              <span className="demo-muted">{d.case} </span>
              <select value={route.id} onChange={(e) => go(route.page === 'case' ? 'case' : 'playground', e.currentTarget.value)}>
                {caseIds.map((id) => (
                  <option key={id} value={id}>
                    {getCase(id).data.title[locale]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <nav className="demo-lang" aria-label={d.language}>
            {(Object.keys(LANGUAGE_NAMES) as Locale[]).map((l) => (
              <a key={l} href={switchHref(route, l)} lang={l} aria-current={l === locale ? 'true' : undefined}>
                {LANGUAGE_NAMES[l]}
              </a>
            ))}
          </nav>
          <button type="button" onClick={flipTheme} aria-pressed={shownTheme === 'dark'}>
            {shownTheme === 'dark' ? d.light : d.dark}
          </button>
        </header>
        <main>
          {route.page === 'index' && <Index locale={locale} />}
          {route.page === 'explorer' && <Explorer />}
          {route.page === 'playground' && <CausalPlayground key={`${route.id}-${locale}`} caseId={route.id} digits={pageDigits()} />}
          {route.page === 'case' && <CasePage key={`${route.id}-${route.step}-${locale}`} caseId={route.id} initialStep={route.step} digits={pageDigits()} />}
          {route.page === 'lesson' && (locale === 'en' ? <LessonEn /> : <LessonZh />)}
          {route.page === 'interactions' && <Interactions key={`${route.id}-${locale}`} item={route.id} />}
          {route.page === 'editor' && (
            <ModelEditor
              key={`${route.id}-${locale}`}
              initial={route.id}
              digits={pageDigits()}
              shareHref={(value) => `${window.location.origin}${window.location.pathname}${href('/editor', locale, `model=${value}`)}`}
            />
          )}
        </main>
        <footer className="demo-footer">
          <CiteBlock />
        </footer>
      </div>
    </LocaleProvider>
  )
}
