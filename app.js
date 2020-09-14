const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const newman = require('newman');
const Collection = require('postman-collection').Collection;
const parse = require('url-parse');

const origin = process.env['api_origin'];
const headers = { Authorization: `Bearer ${process.env['jwt_token']}` }
const gitUrl = process.env.git_url;
const gitPUrl = parse(gitUrl);
let projectId;

getGitlabProjectId(1)
  .then(id => {
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
        }
        resolve(ret);
      })
      .catch(err => {
        reject(err);
      });
  });
}

function getProjectId(repoId) {
  console.log(repoId);
  fetch(`${origin}/repositories/${repoId}/id`, {
          method: 'GET',
          headers: headers
      })
      .then(res => res.json())
      .then(json => {
          projectId = json.data;
          fetch(`${origin}/export_to_postman/${projectId}`,
          {
              method: 'GET',
              headers: headers
          })
          .then(res => res.json())
          .then(json => {
              runNewman(json.data);
          });
      });
}

function buildOptions(path) {
    return { host, port, path, headers }
}

function runNewman(collection) {
    newman.run({
        collection: new Collection(collection)
    }, (err, summary) => {
        if (err) { throw err; }
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

