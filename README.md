# newman-runner
CI/CD tool for devops-system test feature using newman. It will retrieve data from api server of https://github.com/iii-org/devops-system, runs newman then push back the result to the api server.

## Usage
```bash
$ docker pull iiiorg/newman-runner
# Or use .env file by docker run --env-file=.env
$ ln -s <Directory want to be scanned> repo
$ docker run \ 
  --env username=<username on API server> \
  --env password=<password on API server> \
  --env git_url=http://10.50.1.53/root/rotest.git \ # Repo .git URL of gitlab
  --env api_origin=http://127.0.0.1:10009 \ # Origin of api server
  --env test_origin=http://127.0.0.1:10010 \ # Origin of the server to be tested
  --env git_branch=master \ # Indicates the tested branch name 
  --env git_commit_id=aec8d49b \ # Indicates the tested commit
  iiiorg/newman-runner
```

## Note
The working directory must be as same as the `app.js`.

## Use postman json file
Files must be `$GIT_ROOT/iiidevops/postman/postman_collection.json` and `$GIT_ROOT/iiidevops/postman/postman_environment.json`. Both are required.

Also, you must use a postman environment variable named `test_origin` as the origin part of requests.

E.g. An API URL should looks like: `{{test_origin}}/user/login?...`. You should not define `test_origin` in the environment file.

## Report
Execution report will be stored in the db column `report` as a JSON string.
<details><summary>Example</summary>

```json
{
   "in_db":{
      "assertions":{
         "total":0,
         "pending":0,
         "failed":0
      },
      "executions":[
         
      ]
   },
   "json_file":{
      "assertions":{
         "total":3,
         "pending":0,
         "failed":1
      },
      "executions":[
         {
            "name":"login_AM",
            "method":"POST",
            "path":"user/login",
            "assertions":[
               
            ]
         },
         {
            "name":"Project list",
            "method":"GET",
            "path":"project/list",
            "assertions":[
               {
                  "assertion":"success test"
               },
               {
                  "assertion":"message test"
               },
               {
                  "assertion":"this should fail",
                  "error_message":"expected 'success' to deeply equal 'failed'"
               }
            ]
         }
      ]
   }
}
```

</details>

`in_db` stands for tests in database, and `json_file` stands for the tests by postman collections in the repository.

Each item in `executions.assertions` will only contain `error_message` key when the test has an error. If it does not, it is a successful assertion.

