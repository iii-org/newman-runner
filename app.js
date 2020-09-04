const http = require('http');
const newman = require('newman');
const Collection = require('postman-collection').Collection;

const host = process.env['api_host'];
const port = process.env['api_port'];
const headers = { Authorization: `Bearer ${process.env['jwt_token']}` }

const optionsInit = {
    host,
    port,
    path: `/repositories/${process.env['repo_id']}/id`,
    headers
}

const callbackInit = function(response) {
    var resp = '';
    response.on('data', function (chunk) {
        resp += chunk;
    });
    response.on('end', function () {
        const projectId = parseInt(JSON.parse(resp).data);
        http.request(optionsForCollection(projectId), cbForCollection).end();
    });
}

const cbForCollection = function(response) {
    var resp = '';
    response.on('data', function (chunk) {
        resp += chunk;
    });
    response.on('end', function () {
        const collection = JSON.parse(resp).data;
        runNewman(collection);
    });
}

function optionsForCollection(projectId) {
    return {
        host,
        port,
        path: `/export_to_postman/${projectId}`,
        headers
    }
}

function runNewman(collection) {
    // console.log(collection);
    newman.run({
        collection: new Collection(collection)
    }, (err, summary) => {
        if (err) { throw err; }
        const total = summary.run.stats.assertions.total;
        const failed = summary.run.stats.assertions.failed;
        console.log(`${failed}/${total} assertions failed.`);
    });
}

http.request(optionsInit, callbackInit).end();
