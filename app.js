const http = require('http');

const options = {
    host: process.env['api_host'],
    port: process.env['api_port'],
    path: `/repositories/${process.env['repo_id']}/id`,
    headers: {
        Authorization: `Bearer ${process.env['jwt_token']}`
    }
}

const callback = function(response) {
    var resp = '';

    response.on('data', function (chunk) {
        resp += chunk;
    });

    response.on('end', function () {
        console.log(resp);
        const projectId = parseInt(JSON.parse(resp)['data'])
        console.log(projectId);
    });
}

http.request(options, callback).end();
