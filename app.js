const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const newman = require('newman');
const Collection = require('postman-collection').Collection;

const host = process.env['api_host'];
const port = process.env['api_port'];
const headers = { Authorization: `Bearer ${process.env['jwt_token']}` }
let projectId;

fetch(`http://${host}:${port}/repositories/${process.env['repo_id']}/id`, {
            method: 'GET',
            headers: headers
    })
    .then(res => res.json())
    .then(json => {
        projectId = json.data;
        fetch(`http://${host}:${port}/export_to_postman/${projectId}`,
        {
            method: 'GET',
            headers: headers
        })
        .then(res => res.json())
        .then(json => {
            runNewman(json.data);
        });
    });

function buildOptions(path) {
    return { host, port, path, headers }
}

function runNewman(collection) {
    // console.log(collection);
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
            `http://${host}:${port}/testResults`,
            {
                method: 'POST',
                headers,
                body: params
            })
        .then(res => res.json())
        .then(json => {
            if (json.message == 'success') {
                process.exit(0);
            } else {
                console.log(json);
                process.exit(1);
            }
        });
    });
}

