import { AuthService } from '@/main/auth/auth.service'
import { DatabaseService } from '@/main/db/database.service'
import { GitHubCliService } from '@/main/github/github-cli.service'
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
import { ReviewDraftStore } from '@/main/reviews/review-draft.store'
import { ReviewRouter } from '@/main/reviews/review.router'
import { ReviewService } from '@/main/reviews/review.service'
import { ReviewSubmitter } from '@/main/reviews/review.submitter'
import { CachedTourSource } from '@/main/tour/cached-tour-source'
import { CliRunnerService } from '@/main/tour/cli-runner.service'
import { GeneratedTourSource } from '@/main/tour/generated-tour-source'
import { HeadShaResolver } from '@/main/tour/head-sha-resolver'
import { ModelCatalog } from '@/main/tour/model-catalog'
import { PrContextCollector } from '@/main/tour/pr-context.collector'
import { PromptBuilder } from '@/main/tour/prompt.builder'
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
  clones: GitCloneManager
  files: FileSnapshotService
  reviews: ReviewService
  routers: {
    pullRequests: PullRequestRouter
    tours: TourRouter
    files: FileRouter
    reviews: ReviewRouter
  }
}

export function buildServices(): Services {
  const db = new DatabaseService()
  const auth = new AuthService()
  const github = new GitHubCliService()
  const pullRequests = new PullRequestService(auth)

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

  const generatedSource = new GeneratedTourSource(collector, promptBuilder, cli, parser, tourStore, models, clones)
  const tours = new TourService(cachedSource, generatedSource, tourStore)

  const fileSnapshotStore = new FileSnapshotStore(db.query)
  const files = new FileSnapshotService(clones, fileSnapshotStore)

  const reviewDrafts = new ReviewDraftStore(db.query)
  const reviewSubmitter = new ReviewSubmitter(auth)
  const reviews = new ReviewService(reviewDrafts, reviewSubmitter)

  return {
    db,
    auth,
    github,
    pullRequests,
    tours,
    clones,
    files,
    reviews,
    routers: {
      pullRequests: new PullRequestRouter(pullRequests),
      tours: new TourRouter(tours),
      files: new FileRouter(files),
      reviews: new ReviewRouter(reviews),
    },
  }
}
