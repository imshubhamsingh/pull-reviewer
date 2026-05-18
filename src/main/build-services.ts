import { AuthService } from '@/main/auth/auth.service'
import { ChatPromptBuilder } from '@/main/chat/chat-prompt.builder'
import { ChatRouter } from '@/main/chat/chat.router'
import { ChatService } from '@/main/chat/chat.service'
import { PrChatStore } from '@/main/chat/chat.store'
import { DatabaseService } from '@/main/db/database.service'
import { SettingsRouter } from '@/main/settings/settings.router'
import { SettingsStore } from '@/main/settings/settings.store'
import { GitHubCliService } from '@/main/github/github-cli.service'
import { PrRecentStore } from '@/main/github/pr-recent.store'
import { PullRequestRouter } from '@/main/github/pull-request.router'
import { PullRequestService } from '@/main/github/pull-request.service'
import { FileRouter } from '@/main/files/file.router'
import { FileSnapshotService } from '@/main/files/file-snapshot.service'
import { FileSnapshotStore } from '@/main/files/file-snapshot.store'
import { BlobReader } from '@/main/git/blob-reader'
import { CloneRegistry } from '@/main/git/clone-registry'
import { CloneStore } from '@/main/git/clone.store'
import { GitCloneManager } from '@/main/git/clone.manager'
import { GitRunner } from '@/main/git/git-runner'
import { WorktreeManager } from '@/main/git/worktree-manager'
import { ExplainRouter } from '@/main/explain/explain.router'
import { ExplainService } from '@/main/explain/explain.service'
import { QaThreadStore } from '@/main/explain/qa.store'
import { ReviewDraftStore } from '@/main/reviews/review-draft.store'
import { ReviewRouter } from '@/main/reviews/review.router'
import { ReviewService } from '@/main/reviews/review.service'
import { ReviewSubmitter } from '@/main/reviews/review.submitter'
import { HunksService } from '@/main/reviews/hunks.service'
import { HunksRouter } from '@/main/reviews/hunks.router'
import type { BrowserWindow } from 'electron'
import { AiFindingDismissalsStore } from '@/main/tour/ai-finding-dismissals.store'
import { AiReviewPromptBuilder } from '@/main/tour/ai-review-prompt.builder'
import { TourJobManager } from '@/main/tour/tour-job.manager'
import { TourJobStore } from '@/main/tour/tour-job.store'
import { TourNotificationsService } from '@/main/tour/tour-notifications.service'
import { AiReviewParser } from '@/main/tour/ai-review.parser'
import { AiReviewService } from '@/main/tour/ai-review.service'
import { CachedTourSource } from '@/main/tour/cached-tour-source'
import { ChapterCompletionService } from '@/main/tour/chapter-completion.service'
import { ChapterCompletionStore } from '@/main/tour/chapter-completion.store'
import { CliRunnerService } from '@/main/tour/cli-runner.service'
import { FileReviewService } from '@/main/tour/file-review.service'
import { FileReviewStore } from '@/main/tour/file-review.store'
import { GeneratedTourSource } from '@/main/tour/generated-tour-source'
import { HeadShaResolver } from '@/main/tour/head-sha-resolver'
import { ModelCatalog } from '@/main/tour/model-catalog'
import { PrContextCollector } from '@/main/tour/pr-context.collector'
import { PromptBuilder } from '@/main/tour/prompt.builder'
import { ReviewProgressRouter } from '@/main/tour/review-progress.router'
import { TourParser } from '@/main/tour/tour.parser'
import { TourRouter } from '@/main/tour/tour.router'
import { TourService } from '@/main/tour/tour.service'
import { TourStore } from '@/main/tour/tour.store'

export interface Services {
  db: DatabaseService
  auth: AuthService
  github: GitHubCliService
  pullRequests: PullRequestService
  tours: TourService
  tourJobs: TourJobManager
  clones: GitCloneManager
  files: FileSnapshotService
  reviews: ReviewService
  hunks: HunksService
  explain: ExplainService
  chats: ChatService
  settings: SettingsStore
  /** Wired from main.ts after the BrowserWindow is created — used by the tour-job notification handler. */
  setMainWindow: (w: BrowserWindow) => void
  routers: {
    pullRequests: PullRequestRouter
    tours: TourRouter
    files: FileRouter
    reviews: ReviewRouter
    hunks: HunksRouter
    explain: ExplainRouter
    chats: ChatRouter
    settings: SettingsRouter
    reviewProgress: ReviewProgressRouter
  }
}

export function buildServices(): Services {
  const db = new DatabaseService()
  const auth = new AuthService()
  const github = new GitHubCliService()
  const prRecents = new PrRecentStore(db.query)
  const pullRequests = new PullRequestService(auth, prRecents)

  const collector = new PrContextCollector(github)
  const promptBuilder = new PromptBuilder()
  const cli = new CliRunnerService()
  const parser = new TourParser()
  const tourStore = new TourStore(db.query)
  const liveHead = new HeadShaResolver(collector, tourStore)
  const models = new ModelCatalog()
  const cachedSource = new CachedTourSource(tourStore, liveHead)
  const gitRunner = new GitRunner()
  const cloneStore = new CloneStore(db.query)
  const cloneRegistry = new CloneRegistry(gitRunner, cloneStore)
  const blobReader = new BlobReader(gitRunner, cloneRegistry)
  const worktrees = new WorktreeManager(gitRunner, cloneRegistry)
  const clones = new GitCloneManager(cloneRegistry, blobReader, worktrees)

  const aiReviewPromptBuilder = new AiReviewPromptBuilder()
  const aiReviewParser = new AiReviewParser()
  const aiReview = new AiReviewService(aiReviewPromptBuilder, cli, aiReviewParser)

  const generatedSource = new GeneratedTourSource(
    collector,
    promptBuilder,
    cli,
    parser,
    tourStore,
    models,
    clones,
    aiReview,
  )
  const tours = new TourService(cachedSource, generatedSource, tourStore)

  const fileSnapshotStore = new FileSnapshotStore(db.query)
  const files = new FileSnapshotService(clones, fileSnapshotStore)

  const reviewDrafts = new ReviewDraftStore(db.query)
  const reviewSubmitter = new ReviewSubmitter(auth)
  const reviews = new ReviewService(reviewDrafts, reviewSubmitter)
  const hunks = new HunksService(auth)

  const qaStore = new QaThreadStore(db.query)
  const explain = new ExplainService(files, qaStore, cli)

  const settings = new SettingsStore(db.query)
  const chatStore = new PrChatStore(db.query)
  const chatPromptBuilder = new ChatPromptBuilder()
  const chats = new ChatService(
    chatStore,
    settings,
    collector,
    tourStore,
    clones,
    cli,
    models,
    chatPromptBuilder,
  )

  const chapterCompletionStore = new ChapterCompletionStore(db.query)
  const chapterCompletions = new ChapterCompletionService(chapterCompletionStore)
  const fileReviewStore = new FileReviewStore(db.query)
  const fileReviews = new FileReviewService(fileReviewStore)
  const aiFindingDismissals = new AiFindingDismissalsStore(db.query)

  // Background job manager — wraps `tours.generate` with persistence, queue,
  // and a 3-concurrent cap. `onComplete` fires once per job termination
  // (success, failure, or cancellation) and is wired to the OS-notification
  // service below.
  const tourJobStore = new TourJobStore(db.query)
  // GC old finished jobs on launch — table stays small even after months of use.
  tourJobStore.gc()
  let mainWindow: BrowserWindow | undefined
  const notifications = new TourNotificationsService(() => mainWindow)
  const tourJobs = new TourJobManager(tours, collector, tourJobStore, (job, tour, err) => {
    notifications.onJobComplete(job, tour, err)
  })

  return {
    db,
    auth,
    github,
    pullRequests,
    tours,
    tourJobs,
    setMainWindow: (w: BrowserWindow) => {
      mainWindow = w
    },
    clones,
    files,
    reviews,
    hunks,
    explain,
    chats,
    settings,
    routers: {
      pullRequests: new PullRequestRouter(pullRequests),
      tours: new TourRouter(tours, tourJobs),
      files: new FileRouter(files),
      reviews: new ReviewRouter(reviews),
      hunks: new HunksRouter(hunks),
      explain: new ExplainRouter(explain),
      chats: new ChatRouter(chats),
      settings: new SettingsRouter(settings),
      reviewProgress: new ReviewProgressRouter(
        chapterCompletions,
        fileReviews,
        aiFindingDismissals,
      ),
    },
  }
}
