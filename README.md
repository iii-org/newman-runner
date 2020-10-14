# newman-runner
CI/CD tool for devops-system test feature using newman. It will retrieve data from api server of https://github.com/iii-org/devops-system, runs newman then push back the result to the api server.

## Usage
```bash
$ docker pull iiiorg/newman-runner
# Or use .env file by docker run --env-file=.env
$ docker run \ 
  --env jwt_token=<jwt-token> \
  --env git_url=http://10.50.1.53/root/rotest.git \ # Repo .git URL of gitlab
  --env git_token=<gitlab-access-token> \ # The admin's personal access token able to access all user projects. Needed scope is "api".
  --env api_origin=http://127.0.0.1:10009 \ # Origin of api server
  --env test_origin=http://127.0.0.1:10010 \ # Origin of the server to be tested
  --env git_branch=master \ # Only if you need collection file execution, indicate to the branch collection file exists
  iiiorg/newman-runner
```

## Note
The working directory must be as same as the `app.js`.

## Use postman json file
Files must be `$GIT_ROOT/iiidevops/postman/postman_collection.json` and `$GIT_ROOT/iiidevops/postman/postman_environment.json`. Both are required.

Also, you must use a postman environment variable named `test_origin` as the origin part of requests.

E.g. An API URL should looks like: `{{test_origin}}/user/login?...`. You should not define `test_origin` in the environment file.

## Change User

