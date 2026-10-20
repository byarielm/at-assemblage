import { act, renderHook, waitFor } from '@testing-library/react'
import type { GraphItem } from '../graph/model'
import type { SembleConnections } from '../services/sources/semble/types'
import { useUiStore } from '../state/uiStore'
import { signedInFakePds, makeWrapper } from '../test/withAuth'
import { queryKeys } from './keys'
import { useConnections, useCreateConnection, useDeleteConnection } from './semble'

const source: GraphItem = { id: 'at://did:plc:x/network.cosmik.card/a', kind: 'URL', title: 'A', url: 'https://a.example', notes: [], groupIds: [], endpoints: [] }
const target: GraphItem = { ...source, id: 'at://did:plc:x/network.cosmik.card/b', title: 'B', url: 'https://b.example' }
const input = { source, target, sourceId: source.id, targetId: target.id, type: 'SUPPORTS', note: 'because', existing: [] }

async function setup() {
  const { pds, auth } = await signedInFakePds()
  const { Wrapper, queryClient } = makeWrapper(auth)
  const hook = renderHook(
    () => ({ list: useConnections(), create: useCreateConnection(), remove: useDeleteConnection() }),
    { wrapper: Wrapper },
  )
  await waitFor(() => expect(hook.result.current.list.isSuccess).toBe(true))
  const cache = () => queryClient.getQueryData<SembleConnections>(queryKeys.connections(auth.did))!
  return { pds, auth, hook, cache }
}

beforeEach(() => useUiStore.getState().reset())

describe('connection mutations', () => {
  it('adds an optimistic pending edge, then swaps in the saved URI and CID', async () => {
    const { pds, hook, cache } = await setup()
    const release = pds.holdNext('com.atproto.repo.createRecord')
    act(() => hook.result.current.create.mutate(input))
    await waitFor(() => expect(cache().connections).toHaveLength(1))
    expect(cache().connections[0]).toMatchObject({ pending: true, uri: expect.stringMatching(/^pending:/) })

    release()
    await waitFor(() => expect(hook.result.current.create.isSuccess).toBe(true))
    expect(cache().connections[0]?.pending).toBeUndefined()
    expect(cache().connections[0]?.uri).toMatch(/^at:\/\//)
    expect(pds.records.get('network.cosmik.connection')?.size).toBe(1)
  })

  it('rolls back the optimistic edge and offers a retry when the write fails', async () => {
    const { pds, hook, cache } = await setup()
    pds.failNext('com.atproto.repo.createRecord', 500, 'InternalServerError')
    act(() => hook.result.current.create.mutate(input))
    await waitFor(() => expect(hook.result.current.create.isError).toBe(true))
    expect(cache().connections).toHaveLength(0)
    const notice = useUiStore.getState().notices.at(-1)
    expect(notice?.tone).toBe('error')
    expect(notice?.retryDraft).toMatchObject({ sourceId: source.id, targetId: target.id, type: 'SUPPORTS', note: 'because' })
  })

  it('refuses duplicates and self-connections without writing', async () => {
    const { pds, hook } = await setup()
    act(() =>
      hook.result.current.create.mutate({ ...input, existing: [{ id: 'x', sourceId: source.id, targetId: target.id, type: 'supports' }] }),
    )
    await waitFor(() => expect(hook.result.current.create.isError).toBe(true))
    expect(hook.result.current.create.error?.message).toMatch(/already have a connection/)
    expect(pds.count('com.atproto.repo.createRecord')).toBe(0)
  })

  it('restores a deleted edge when the delete fails', async () => {
    const { pds, hook, cache } = await setup()
    await act(() => hook.result.current.create.mutateAsync(input))
    const uri = cache().connections[0]!.uri
    pds.failNext('com.atproto.repo.deleteRecord', 403, 'Forbidden')
    act(() => hook.result.current.remove.mutate(uri))
    await waitFor(() => expect(hook.result.current.remove.isError).toBe(true))
    expect(cache().connections.map((c) => c.uri)).toEqual([uri])
  })

  it('deletes a connection', async () => {
    const { pds, hook, cache } = await setup()
    await act(() => hook.result.current.create.mutateAsync(input))
    await act(() => hook.result.current.remove.mutateAsync(cache().connections[0]!.uri))
    expect(cache().connections).toHaveLength(0)
    expect(pds.records.get('network.cosmik.connection')?.size).toBe(0)
  })
})
