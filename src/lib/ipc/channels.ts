export const IPC = {
  GetApiPort: 'app:get-api-port',
  ResourceUpdated: 'app:resource-updated',
  OpenExternal: 'app:open-external',
  /** Fired from main when a background tour job finishes and the user clicks its notification. */
  OpenPrTour: 'app:open-pr-tour',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export type ResourceUpdatedEvent =
  | { resource: 'tour'; pullRequestId: string }
  | { resource: 'pull-request'; pullRequestId: string }

export interface OpenPrTourPayload {
  repo: string
  prNumber: number
  /** Short SHA prefix (7 chars) for the head this notification refers to. */
  headRefShort?: string
}
