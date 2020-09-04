const request = require('request');
const newman = require('newman');
const Collection = require('postman-collection').Collection;

const host = process.env['api_host'];
const port = process.env['api_port'];
const headers = { Authorization: `Bearer ${process.env['jwt_token']}` }
let projectId;

request({
            url: `http://${host}:${port}/repositories/${process.env['repo_id']}/id`,
            method: 'GET',
            headers: headers
        },
        (error, response, body) => {
            projectId = parseInt(JSON.parse(body).data);
            request({
                url: `http://${host}:${port}/export_to_postman/${projectId}`,
                method: 'GET',
                headers: headers
            }, cbForCollection);
        });

const cbForCollection = function(error, response, body) {
    const collection = JSON.parse(body).data;
    runNewman(collection);
}

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
        request({
            url: `http://${host}:${port}/testResults`,
            method: 'POST',
            headers,
            json: true,
            body: { project_id: projectId,
                total: total,
                fail: failed
            }
        }, cbPostResult
        );
    });
}

const cbPostResult = function(error, response, body) {
    if (body.message == 'success') {
        process.exit(0);
    } else {
        console.log(resp);
        process.exit(1);
    }
}

