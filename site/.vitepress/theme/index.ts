import DefaultTheme from 'vitepress/theme'
import InstallCommand from './InstallCommand.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('InstallCommand', InstallCommand)
    if (import.meta.env.SSR || typeof document === 'undefined') return
    // Remember explicit locale choices: clicking any cross-locale link stores
    // dshcc-lang so the auto-routing on / never overrides it on later visits.
    document.addEventListener(
      'click',
      (event) => {
        const anchor = (event.target instanceof Element && event.target.closest('a')) || null
        if (!anchor) return
        const target = anchor.getAttribute('href')
        if (!target || !target.startsWith('/')) return
        try {
          const targetIsZh = target.startsWith('/zh/')
          const hereIsZh = location.pathname.startsWith('/zh/')
          if (targetIsZh !== hereIsZh) {
            localStorage.setItem('dshcc-lang', targetIsZh ? 'zh' : 'en')
          }
        } catch {
          /* storage unavailable — ignore */
        }
      },
      true, // capture: run before SPA navigation swallows the click
    )
  },
}
