
synth-httpd:
	cd httpd && cd cdk && npm run synth
deploy-httpd:
	cd httpd && cd cdk && npm run deploy
install:
	cd httpd && cd cdk && npm install
	cd httpd && cd cdk-corrected && npm install
deploy-storage:
	aws cloudformation create-stack --region eu-west-2 --stack-name FileServerStorage --template-body file://storage/cloudformation.yml --tags Key=service,Value=file-server;
update-storage:
	aws cloudformation update-stack --region eu-west-2 --stack-name FileServerStorage --template-body file://storage/cloudformation.yml --tags Key=service,Value=file-server;
