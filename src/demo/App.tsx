import { useEffect, useState } from 'react'
import { CasePage, CausalPlayground, CiteBlock, ModelEditor, Supplement, WorldLanes } from '../components/index.ts'
import { caseIds, getCase } from '../data/index.ts'

interface Route {
  readonly page: 'index' | 'playground' | 'case' | 'lesson' | 'editor'
  readonly id: string
  readonly step: number
}

function parse(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const params = new URLSearchParams(query)
  const step = Number(params.get('step') ?? '1') || 1
  const parts = path.split('/').filter((p) => p !== '')
  const id = parts[1] !== undefined && caseIds.includes(parts[1]) ? parts[1] : 'rock-throwing'
  if (parts[0] === 'playground') return { page: 'playground', id, step }
  if (parts[0] === 'case') return { page: 'case', id, step }
  if (parts[0] === 'lesson') return { page: 'lesson', id, step }
  if (parts[0] === 'editor') return { page: 'editor', id, step }
  return { page: 'index', id, step }
}

function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash))
  useEffect(() => {
    const on = (): void => setRoute(parse(window.location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState(() => new URLSearchParams(window.location.search).get('theme') ?? 'light')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))]
}

function Index() {
  return (
    <div className="demo-index">
      <h1>causal-atlas</h1>
      <p className="demo-muted">元件示範。每個案例有一頁案例頁，也可以在遊樂場裡自己改。</p>
      <ul>
        {caseIds.map((id) => {
          const c = getCase(id)
          return (
            <li key={id}>
              <a href={`#/case/${id}`}>{c.data.title.zh}</a>
              <a className="demo-muted" href={`#/playground/${id}`}>
                遊樂場
              </a>
            </li>
          )
        })}
      </ul>
      <p>
        <a href="#/lesson">講義示範：世界分道</a>
      </p>
      <p>
        <a href="#/editor">自己建一個因果模型</a>
      </p>
    </div>
  )
}

function Lesson() {
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

export function App() {
  const route = useRoute()
  const [theme, toggleTheme] = useTheme()
  const go = (page: 'playground' | 'case', id: string): void => {
    window.location.hash = `#/${page}/${id}`
  }
  return (
    <div className="demo-shell">
      <header className="demo-bar">
        <a className="demo-brand" href="#/">
          causal-atlas
        </a>
        <nav aria-label="示範頁面">
          <a href={`#/playground/${route.id}`} aria-current={route.page === 'playground' ? 'page' : undefined}>
            遊樂場
          </a>
          <a href={`#/case/${route.id}`} aria-current={route.page === 'case' ? 'page' : undefined}>
            案例頁
          </a>
          <a href="#/lesson" aria-current={route.page === 'lesson' ? 'page' : undefined}>
            講義
          </a>
          <a href="#/editor" aria-current={route.page === 'editor' ? 'page' : undefined}>
            自己建模型
          </a>
        </nav>
        <span className="demo-spacer" />
        {(route.page === 'playground' || route.page === 'case') && (
          <label>
            <span className="demo-muted">案例 </span>
            <select value={route.id} onChange={(e) => go(route.page === 'case' ? 'case' : 'playground', e.currentTarget.value)}>
              {caseIds.map((id) => (
                <option key={id} value={id}>
                  {getCase(id).data.title.zh}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" onClick={toggleTheme} aria-pressed={theme === 'dark'}>
          {theme === 'dark' ? '淺色' : '深色'}
        </button>
      </header>
      <main>
        {route.page === 'index' && <Index />}
        {route.page === 'playground' && <CausalPlayground key={route.id} caseId={route.id} />}
        {route.page === 'case' && <CasePage key={`${route.id}-${route.step}`} caseId={route.id} initialStep={route.step} />}
        {route.page === 'lesson' && <Lesson />}
        {route.page === 'editor' && (
          <ModelEditor
            key={route.id}
            initial={route.id}
            shareHref={(value) => `${window.location.origin}${window.location.pathname}#/editor?model=${value}`}
          />
        )}
      </main>
      <footer className="demo-footer">
        <CiteBlock />
      </footer>
    </div>
  )
}
