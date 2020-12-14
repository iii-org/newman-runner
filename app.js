const fetch = require('node-fetch');
const {URLSearchParams} = require('url');
const newman = require('newman');
const parse = require('url-parse');
const fs = require('fs');

const COLLECTION_FNAME = 'postman_collection.json';
const ENVIRONMENT_FNAME = 'postman_environment.json'
const STORAGE_PREFIX = 'repo/iiidevops/postman/';

const origin = process.env['api_origin'];
const target = process.env['test_origin'];
const git = {
  url: process.env['git_url'],
  pUrl: parse(process.env['git_url']),
  branch: process.env['git_branch'],
  commit_id: process.env['git_commit_id']
}
const verbose = process.env['verbose'] === 'true';
const global = {
  jwtToken: null,
  repoId: -1,
  projectId: -1,
  total: 0,
  failed: 0,
  report: {}
}

function apiGet(path, headers) {
  return new Promise((resolve, reject) => {
    if (!headers) {
      headers = {};
    }
    headers['Authorization'] = `Bearer ${global.jwtToken}`;
    const opts = {headers}
    fetch(process.env['api_origin'] + path, opts)
      .then(res => res.json())
      .then(json => resolve(json))
      .catch(err => {
        console.error(err);
        process.exit(1);
      });
  })
}

function apiPost(path, headers, body) {
  return new Promise((resolve, reject) => {
    if (!headers) {
      headers = {};
    }
    headers['Authorization'] = `Bearer ${global.jwtToken}`;
    const params = new URLSearchParams();
    for (let key in body) {
      params.append(key, body[key])
    }
    const opts = {method: 'POST', headers, body: params}
    fetch(process.env['api_origin'] + path, opts)
      .then(res => res.json())
      .then(json => resolve(json))
      .catch(err => {
        console.error(err);
        process.exit(1);
      });
  })
}

if (verbose) {
  console.log('Log into API server...');
}

apiPost('/user/login', null, {
  username: process.env['username'],
  password: process.env['password']
}).then(json => {
  global.jwtToken = json.data.token;
  if (verbose) console.log('Retrieving repo_id...');
  apiGet(`/repositories/id?repository_url=${git.url}`)
    .then(json => {
      global.projectId = json.data.project_id;
      global.repoId = json.data.repository_id;
      if (verbose) console.log('repo_id is ' + global.repoId);
      apiGet(`/export_to_postman/${global.projectId}?target=${
        encodeURIComponent(target)}`)
        .then(json => {
          if (json.message !== 'success') {
            throw Error(JSON.stringify(json));
          }
          const data = json.data;
          if (verbose) {
            console.log('collection json is:');
            console.log(data);
          }
          const filename = 'collection.json';
          fs.writeFileSync(filename, JSON.stringify(data));
          runNewmanInAPIDB(filename);
        })
        .catch(err => {
          console.error(err);
        });
    })
});

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

function checkCollectionFile() {
  const collectionPath = STORAGE_PREFIX + COLLECTION_FNAME;
  if (!fs.existsSync(collectionPath)) {
    if (verbose) console.log('No collection file found.');
    uploadResult(global.projectId, global.total, global.failed)
    return;
  }
  if (verbose) console.log("Collection file found.");
  const environmentPath = STORAGE_PREFIX + ENVIRONMENT_FNAME;
  if (!fs.existsSync(environmentPath)) {
    if (verbose) console.log('No environment file found.');
    uploadResult(global.projectId, global.total, global.failed)
    return;
  }
  if (verbose) console.log("Environment file found.");
  runNewmanByJSON();
}

function runNewmanByJSON() {
  if (verbose) console.log("Running newman for json files...");
  const options = {
    collection: STORAGE_PREFIX + COLLECTION_FNAME,
    environment: STORAGE_PREFIX + ENVIRONMENT_FNAME,
    envVar: [{key: 'test_origin', value: target}]
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
    fs.unlink('./' + COLLECTION_FNAME, () => {
    });
    fs.unlink('./' + ENVIRONMENT_FNAME, () => {
    });
    uploadResult(global.projectId, global.total,
      global.failed, JSON.stringify(global.report));
  });
}

function uploadResult(projectId, total, failed, report) {
  const params = new URLSearchParams();
  params.append('project_id', projectId);
  params.append('total', total);
  params.append('fail', failed);
  params.append('branch', git.branch);
  params.append('commit_id', git.commit_id);
  params.append('report', report);
  fetch(
    `${origin}/testResults`,
    {
      method: 'POST',
      headers: {Authorization: `Bearer ${global.jwtToken}`},
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
