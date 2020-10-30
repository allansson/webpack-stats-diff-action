const path = require('path')
const fs = require('fs')
const github = require('@actions/github')
const core = require('@actions/core')
const { getStatsDiff } = require('webpack-stats-diff')
const fileSize = require('filesize')
const markdownTable = require('markdown-table')

const doesPathExists = path => {
  if (!fs.existsSync(path)) {
    throw new Error(`${path} does not exist!`)
  }
}

const toSeconds = ms => Math.floor(ms / 1000)
 
const formatTime = (totalSecs) => {
  const sign = Math.sign(totalSecs) < 0 ? '-' : ''
  const abs = Math.abs(totalSecs)

  const secs = Math.floor(abs % 60)
  const mins = Math.floor(abs / 60)
 
  const secsStr = secs.toFixed(0).padStart(mins > 0 ? 2 : 1, '0')
  const minsStr = mins > 0 ? mins + 'm ' : ''
  
  return `${sign}${minsStr}${secsStr}s`
};
 
const formatTimeDiff = (previous, current) => {
  const diff = current - previous
  const time = formatTime(diff)

  const percentage = (diff / previous) * 100

  return `${time} (${percentage.toFixed(2)}%)`
};

async function run() {
  try {
    const statsPaths = {
      base: core.getInput('base_stats_path'),
      head: core.getInput('head_stats_path')
    }

    const paths = {
      base: path.resolve(process.cwd(), statsPaths.base),
      head: path.resolve(process.cwd(), statsPaths.head)
    }

    doesPathExists(paths.base)
    doesPathExists(paths.head)

    const stats = {
      base: require(paths.base),
      head: require(paths.head)
    } 
 
    const diff = getStatsDiff(stats.base.assets, stats.head.assets, {
      extensions: [".html", ".js", ".css"] 
    })
 
    const baseTime = toSeconds(stats.base.time)
    const headTime = toSeconds(stats.head.time) 

    const buildTable = markdownTable([
      [
        'Old time', 
        'New time', 
        'Diff'
      ],  
      [
        formatTime(baseTime),
        formatTime(headTime),
        formatTimeDiff(baseTime, headTime)
      ]
    ])
 
    const summaryTable = markdownTable([
      [
        'Old size', 
        'New size', 
        'Diff'
      ],      
      [
        fileSize(diff.total.oldSize),
        fileSize(diff.total.newSize),
        `${fileSize(diff.total.diff)} (${diff.total.diffPercentage.toFixed(2)}%)`
      ]
    ])

    /**
     * Publish a comment in the PR with the diff result.
     */
    const octokit = github.getOctokit(core.getInput('token'))

    const pullRequestId = github.context.issue.number
    if (!pullRequestId) {
      throw new Error('Cannot find the PR id.')
    }

    await octokit.issues.createComment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: pullRequestId,
      body: `## Build difference
${buildTable}
 
## Bundle difference
${summaryTable}
`
    })
  }
  catch (error) {
    core.setFailed(error.message)
  }
}

run()
