const fetch = require('node-fetch');
const {URLSearchParams} = require('url');
const newman = require('newman');
const parse = require('url-parse');
const fs = require('fs');

const COLLECTION_FNAME = 'postman_collection.json';
const ENVIRONMENT_FNAME = 'postman_environment.json'
const STORAGE_PREFIX = 'iiidevops/postman/';

const origin = process.env['api_origin'];
const target = process.env['test_origin'];
const headers = {Authorization: `Bearer ${process.env['jwt_token']}`}
const git = {
  url: process.env['git_url'],
  pUrl: parse(process.env['git_url']),
  token: process.env['git_token'],
  branch: process.env['git_branch']
} 
const verbose = process.env['verbose'] == 'true';
const global = {
  repoId: -1,
  projectId: -1,
  total: 0,
  failed: 0,
  report: {}
}

if (verbose) {
  console.log('Retrieving repo_id...');
}

getGitlabProjectId(1)
  .then(id => {
    if (verbose) console.log('repo_id is ' + id);
    global.repoId = id;
    getProjectId(id);
  })
  .catch(err => {
    console.error(err);
  });

function getGitlabProjectId(page) {
  return new Promise((resolve, reject) => {
    let ret = -1;
    fetch(git.pUrl.origin +
      '/api/v4/projects?simple=true&per_page=50&page=' + page,
      {
        headers: {'PRIVATE-TOKEN': git.token}
      })
      .then(res => res.json())
      .then(json => {
        for (p in json) {
          const proj = json[p];
          if (proj.http_url_to_repo == git.url) {
            ret = proj.id;
            break;
          }
        }
        if (ret < 0) {
          if (json.length < 20) {
            reject(`Git URL ${git.url} not found!\nUse URL with suffix .git`);
          } else {
            getGitlabProjectId(page + 1)
              .then(json => resolve(json));
          }
        } else {
          resolve(ret);
        }
      })
      .catch(err => {
        reject(err);
      });
  });
}

function getProjectId(repoId) {
  fetch(`${origin}/repositories/${repoId}/id`, {
    method: 'GET',
    headers: headers
  })
    .then(res => res.json())
    .then(json => {
      global.projectId = json.data;
      if (verbose) console.log('project id is ' + global.projectId);
      fetch(`${origin}/export_to_postman/${global.projectId}?target=${
          encodeURIComponent(target)}`,
        {
          method: 'GET',
          headers: headers
        })
        .then(res => res.json())
        .then(json => {
          if (json.message != 'success') {
            throw Error(JSON.stringify(json));
          }
          const data = json.data;
          if (verbose) {
            console.log('collection json is:');
            console.log(data);
          }
          const filename = 'collection.json';
          fs.writeFileSync(filename, data.toString());
          runNewmanInAPIDB(filename);
        })
        .catch(err => {
          console.error(err);
        });
    });
}

function runNewmanInAPIDB(filename) {
  const options = {collection: require('./' + filename)}
  if (verbose) options['reporters'] = 'cli';
  newman.run(options, (err, summary) => {
    if (err) {
      throw err;
    }
    global.report.in_db = reduceSummary(summary);
    fs.unlink(filename, () => {
    });
    global.total = summary.run.stats.assertions.total;
    global.failed = summary.run.stats.assertions.failed;
    checkCollectionFile();
  });
}

function reduceSummary(s) {
  ret = {};
  ret.assertions = s.run.stats.assertions;
  ret.executions = [];
  for (let i in s.run.executions) {
    const e = s.run.executions[i];
    const re = {};
    re.name = e.item.name;
    re.method = e.request.method;
    re.path = e.request.url.path.join('/');
    re.assertions = [];
    for (let j in e.assertions) {
      const a = e.assertions[j];
      const ra = {};
      ra.assertion = a.assertion;
      if (a.error) {
        ra.error_message = a.error.message;
      }
      re.assertions.push(ra);
    }
    ret.executions.push(re);
  }
  return ret;
}

function gitFileAPIUrl(path) {
  return `${git.pUrl.origin}/api/v4/projects/${global.repoId}`
    + `/repository/files/${path}/raw?ref=${git.branch}`
}

function checkCollectionFile() {
  const collectionPath = encodeURIComponent(STORAGE_PREFIX + COLLECTION_FNAME);
  fetch(gitFileAPIUrl(collectionPath),
    {headers: {'PRIVATE-TOKEN': git.token}})
    .then(res => {
      if (res.status === 404) {
        if (verbose) console.log('No collection file found.');
        uploadResult(global.projectId, global.total, global.failed)
        return;
      }
      if (verbose) console.log("Collection file found.");
      const dest = fs.createWriteStream('./' + COLLECTION_FNAME);
      res.body.pipe(dest);
      downloadEnvironment();
    })
    .catch(err => {
      console.error(err);
    });
}

function downloadEnvironment() {
  const environmentPath = encodeURIComponent(STORAGE_PREFIX + ENVIRONMENT_FNAME);
  fetch(gitFileAPIUrl(environmentPath),
    {headers: {'PRIVATE-TOKEN': git.token}})
    .then(res => {
      if (res.status === 404) {
        if (verbose) console.log('No environment file found.');
        uploadResult(global.projectId, global.total, global.failed)
        return;
      }
      if (verbose) console.log("Environment file found.");
      const dest = fs.createWriteStream('./' + ENVIRONMENT_FNAME);
      res.body.pipe(dest);
      runNewmanByJSON();
    })
    .catch(err => {
      console.error(err);
    });
}

function runNewmanByJSON() {
  if (verbose) console.log("Running newman for json files...");
  const options = {
    collection: './' + COLLECTION_FNAME,
    environment: './' + ENVIRONMENT_FNAME,
    envVar: [{ key: 'test_origin', value: target }]
  }
  if (verbose) options['reporters'] = 'cli';
  newman.run(options, (err, summary) => {
    if (err) {
      throw err;
    }
    global.report.json_file = reduceSummary(summary);
    if (verbose) {
      console.log('report is:');
      console.log(JSON.stringify(global.report));
    }
    global.total += summary.run.stats.assertions.total;
    global.failed += summary.run.stats.assertions.failed;
    fs.unlink('./' + COLLECTION_FNAME, () => {});
    fs.unlink('./' + ENVIRONMENT_FNAME, () => {});
    uploadResult(global.projectId, global.total, 
        global.failed, global.report)
  });
}

function uploadResult(projectId, total, failed, report) {
  const params = new URLSearchParams();
  params.append('project_id', projectId);
  params.append('total', total);
  params.append('fail', failed);
  params.append('branch', git.branch);
  params.append('report', report);
  fetch(
    `${origin}/testResults`,
    {
      method: 'POST',
      headers,
      body: params
    })
    .then(res => res.json())
    .then(json => {
      if (json.message == 'success') {
        console.log(`Project #${projectId} executed, ${failed}/${total} assertion failed.`);
        process.exit(0);
      } else {
        console.log("Error while executing, response=");
        console.log(json);
        process.exit(1);
      }
    });

}
