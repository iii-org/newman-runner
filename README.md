# newman-runner
CI/CD tool for devops-system test feature using newman. It will retrieve data from api server of https://github.com/iii-org/devops-system, runs newman then push back the result to the api server.

## Usage
```bash
$ docker pull iiiorg/newman-runner
# Or use .env file by docker run --env-file=.env
$ docker run \ 
  --env jwt-token=<jwt-token> \
  --env repo_id=11 # github-repo-id \
  --env api_origin=http://127.0.0.1:10009 #origin of api server \
  iiiorg/newman-runner
```
