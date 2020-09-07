const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const newman = require('newman');
const Collection = require('postman-collection').Collection;

const origin = process.env['api_origin'];
const headers = { Authorization: `Bearer ${process.env['jwt_token']}` }
let projectId;

fetch(`${origin}/repositories/${process.env['repo_id']}/id`, {
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

