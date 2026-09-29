import { beforeEach, vi } from 'vitest'
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Live network access is forbidden in unit tests') }))
})
