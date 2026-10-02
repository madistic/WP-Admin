const { execSync } = require('child_process');
const awsCli = 'C:\\Users\\khano\\AppData\\Local\\Programs\\Amazon\\AWSCLIV2\\aws.exe';
const ecrRegistry = '667819981546.dkr.ecr.ap-south-1.amazonaws.com';
const repo = ${ecrRegistry}/restroconnect-restaurant;
const tag = 'step11-8-webhook-fix';

console.log('1. Getting ECR login password...');
const pwd = execSync(& "$awsCli" ecr get-login-password --region ap-south-1, { shell: 'powershell.exe' }).toString().trim();

console.log('2. Docker login...');
const loginRes = execSync(docker login --username AWS --password-stdin $ecrRegistry, {
  input: pwd + '\n'
});
console.log(loginRes.toString());

console.log(3. Building image $repo:$tag...);
execSync(docker build -f Dockerfile -t $repo:$tag ., { stdio: 'inherit' });
console.log('Built and tagged.');

console.log(4. Pushing $repo:$tag...);
execSync(docker push $repo:$tag, { stdio: 'inherit' });
console.log('Push completed.');
