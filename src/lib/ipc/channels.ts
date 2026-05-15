export const IPC = {
  GetApiPort: 'app:get-api-port',
  ResourceUpdated: 'app:resource-updated',
  OpenExternal: 'app:open-external',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export type ResourceUpdatedEvent =
  | { resource: 'tour'; pullRequestId: string }
  | { resource: 'pull-request'; pullRequestId: string }
