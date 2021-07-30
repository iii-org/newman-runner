const fetch = require('node-fetch');
const {URLSearchParams} = require('url');
const newman = require('newman');
const parse = require('url-parse');
const fs = require('fs');

const COLLECTION_SUFFIX = 'postman_collection.json';
const ENVIRONMENT_SUFFIX = 'postman_environment.json'
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
  scanId: null,
  total: 0,
  failed: 0,
  report: {json_file: {}}
}

const runCheck = {}

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
  checkPluginDisabled('postman');
});

function checkPluginDisabled(pluginName) {
  apiGet('/plugins').then(json => {
    const data = json.data
    for (const d of data) {
      if (d.name === pluginName) {
        if (d.disabled) {
          console.log('Postman plugin is disabled.')
          process.exit(0)
        }
      }
    }
    retrieveRepoId()
  })
}

function retrieveRepoId() {
  if (verbose) console.log('Retrieving repo_id...');
  apiGet(`/repositories/id?repository_url=${git.url}`)
    .then(json => {
      global.projectId = json.data.project_id;
      global.repoId = json.data.repository_id;
      if (verbose) console.log('repo_id is ' + global.repoId);
      createScan(global.projectId);
    })
}

function createScan(projectId) {
  const params = new URLSearchParams();
  params.append('project_id', projectId);
  params.append('branch', git.branch);
  params.append('commit_id', git.commit_id);
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
        global.scanId = json.data['scan_id'];
        getCollection();
      } else {
        console.log("Error while executing, response=");
        console.log(json);
        process.exit(1);
      }
    });
}

function getCollection() {
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

function checkCollectionFile() {
  files = fs.readdirSync(STORAGE_PREFIX);
  // First decide default environment file
  let defaultEnvFile = null;
  for (const file of files) {
    if (file.endsWith(ENVIRONMENT_SUFFIX)) {
      defaultEnvFile = file;
    }
  }
  if (verbose) {
    console.log(`Default env file is ${defaultEnvFile}`)
  }
  if (defaultEnvFile == null) {
    if (verbose) console.log('No environment file found.');
    uploadResult();
    return;
  }

  const handlers = []
  for (const file of files) {
    if (!file.endsWith(COLLECTION_SUFFIX)) {
      continue;
    }
    const name = file.substring(0, file.length - COLLECTION_SUFFIX.length);
    let envFile = name + ENVIRONMENT_SUFFIX;
    if (!fs.existsSync(envFile)) {
      envFile = defaultEnvFile;
    }
    let displayName = name
    if (name.endsWith('.')) {
      displayName = name.substring(0, name.length - 1);
    }
    if (verbose) {
      console.log('Collection file is', name);
      console.log('Env file is', envFile);
    }
    handlers.push(runNewmanByJSON(file, envFile, displayName));
  }
  Promise.all(handlers).then(() => {
    uploadResult();
  })
}

function runNewmanByJSON(file, envFile, displayName) {
  return new Promise((resolve, reject) => {
    if (verbose) {
      console.log("Running newman for json files...");
    }
    runCheck[file] = false;
    const options = {
      collection: STORAGE_PREFIX + file,
      environment: STORAGE_PREFIX + envFile,
      envVar: [{key: 'test_origin', value: target}]
    }
    if (verbose) options['reporters'] = 'cli';
    newman.run(options, (err, summary) => {
      if (err) {
        throw err;
      }
      global.report.json_file[displayName] = reduceSummary(summary);
      if (verbose) {
        console.log('report is:');
        console.log(JSON.stringify(global.report));
      }
      global.total += summary.run.stats.assertions.total;
      global.failed += summary.run.stats.assertions.failed;
      resolve();
    });
  })
}

function uploadResult() {
  const projectId = global.projectId;
  const total = global.total;
  const failed = global.failed;
  const report = JSON.stringify(global.report);
  const params = new URLSearchParams();
  params.append('scan_id', global.scanId);
  params.append('project_id', projectId);
  params.append('total', total);
  params.append('fail', failed);
  params.append('report', report);
  fetch(
    `${origin}/testResults`,
    {
      method: 'PUT',
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
