import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const pageModules = import.meta.glob('../pages/**/index.vue')

function routesFromPages(): RouteRecordRaw[] {
  const routes: RouteRecordRaw[] = []

  for (const [filePath, loader] of Object.entries(pageModules)) {
    const match = filePath.match(/\.\.\/pages\/([^/]+)\/index\.vue$/)
    if (!match) continue

    const dirName = match[1]
    const path = dirName.toLowerCase() === 'main' ? '/' : `/${dirName}`

    routes.push({
      path,
      name: dirName,
      component: loader,
    })
  }

  routes.sort((a, b) => (a.path === '/' ? -1 : b.path === '/' ? 1 : 0))

  routes.push({
    path: '/:pathMatch(.*)*',
    redirect: '/',
  })

  return routes
}

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: routesFromPages(),
})

