import { Notification, type BrowserWindow } from 'electron'
import { IPC } from '@/lib/ipc/channels'
import { Service } from '@/main/service'
import type { TourJobRecord } from '@/main/tour/tour-job.store'
import type { TourResult } from '@/main/tour/tour-source'

/**
 * Fires a native OS notification when a background tour job completes.
 * Click handler focuses the app window and sends an `OpenPrTour` IPC
 * event the renderer listens for to navigate to that PR's TourView.
 *
 * The window reference is passed via a getter so we don't capture a
 * stale window after re-create (macOS activate flow).
 */
export class TourNotificationsService extends Service {
  constructor(private readonly getWindow: () => BrowserWindow | undefined) {
    super()
  }

  onJobComplete(job: TourJobRecord, _tour?: TourResult, err?: Error): void {
    if (!Notification.isSupported()) {
      this.logger.warn('OS notifications not supported on this platform')
      return
    }
    const shaShort = job.headRefOid.slice(0, 7)
    const cancelled = job.status === 'cancelled'
    const title = err
      ? `Tour failed: ${job.repo} #${job.prNumber} (${shaShort})`
      : cancelled
        ? `Tour cancelled: ${job.repo} #${job.prNumber} (${shaShort})`
        : `Tour ready: ${job.repo} #${job.prNumber} (${shaShort})`
    const body = err
      ? truncate(err.message, 140)
      : cancelled
        ? 'You cancelled this generation.'
        : 'Click to open the tour.'
    const n = new Notification({ title, body, silent: false })
    n.on('click', () => {
      const w = this.getWindow()
      if (!w) return
      if (w.isMinimized()) w.restore()
      w.show()
      w.focus()
      w.webContents.send(IPC.OpenPrTour, {
        repo: job.repo,
        prNumber: job.prNumber,
        headRefShort: shaShort,
      })
    })
    n.show()
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
