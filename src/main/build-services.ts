import { AuthService } from '@/main/auth/auth.service'
import { DatabaseService } from '@/main/db/database.service'
import { GitHubCliService } from '@/main/github/github-cli.service'
import { PullRequestRouter } from '@/main/github/pull-request.router'
import { PullRequestService } from '@/main/github/pull-request.service'
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
  routers: {
    pullRequests: PullRequestRouter
    tours: TourRouter
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
  const generatedSource = new GeneratedTourSource(collector, promptBuilder, cli, parser, tourStore, models)
  const tours = new TourService(cachedSource, generatedSource, tourStore)

  return {
    db,
    auth,
    github,
    pullRequests,
    tours,
    routers: {
      pullRequests: new PullRequestRouter(pullRequests),
      tours: new TourRouter(tours),
    },
  }
}
