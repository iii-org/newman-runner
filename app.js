const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const newman = require('newman');
const parse = require('url-parse');
const fs = require('fs');

const origin = process.env['api_origin'];
const target = process.env['test_origin'];
const headers = { Authorization: `Bearer ${process.env['jwt_token']}` }
const gitUrl = process.env['git_url'];
const gitPUrl = parse(gitUrl);
const verbose = process.env['verbose'] == 'true';
let projectId;

if (verbose) {
  console.log('Retrieving repo_id...');
}

getGitlabProjectId(1)
  .then(id => {
    if (verbose) console.log('repo_id is ' + id);
		getProjectId(id);
  })
  .catch(err => {
    console.error(err);
  });

function getGitlabProjectId(page) {
  return new Promise((resolve, reject) => {
    let ret = -1;
    fetch(gitPUrl.origin +
        '/api/v4/projects?simple=true&per_page=50&page=' + page,
    {
      headers: { 'PRIVATE-TOKEN': process.env.git_token }
    })
      .then(res => res.json())
      .then(json => {
        for (p in json) {
          const proj = json[p];
          if (proj.http_url_to_repo == gitUrl) {
            ret = proj.id;
            break;
          }
        }
        if (ret < 0) {
          if (json.length < 20) {
            reject(`Git URL ${gitUrl} not found!\nUse URL with suffix .git`);
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
          projectId = json.data;
          if (verbose) console.log('project id is ' + projectId);
          fetch(`${origin}/export_to_postman/${projectId}?target=${
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
            data = json.data;
            if (verbose) {
              console.log('collection json is:');
              console.log(data);
            }
            const filename = 'collection.json';
            fs.writeFileSync(filename, data.toString());
            runNewman(filename);
          })
          .catch(err => {
            console.error(err);
          });
      });
}

function buildOptions(path) {
    return { host, port, path, headers }
}

function runNewman(filename) {
    options = { collection: require('./' + filename) }
    if (verbose) options['reporters'] = 'cli';
    newman.run({
        collection: require('./' + filename) 
    }, (err, summary) => {
        if (err) { throw err; }
        fs.unlink(filename, () => {});
        if (verbose) {
          console.log('assertions is:');
          console.log(summary.run.stats.assertions);
        }
        const total = summary.run.stats.assertions.total;
        const failed = summary.run.stats.assertions.failed;
        const params = new URLSearchParams();
        params.append('project_id', projectId);
        params.append('total', total);
        params.append('fail', failed);
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
    });
}

