
var AWS = require('aws-sdk');


var dynamoParams = {
    apiVersion: '2012-08-10',
    maxRetries: 5,
    httpOptions: {
        timeout: 5000
    }
};

if (process.env.AWS_DDB_ENDPOINT) {
     dynamoParams.endpoint = process.env.AWS_DDB_ENDPOINT;
}
var ddbService = new AWS.DynamoDB(dynamoParams);
var docParams = {
    service: ddbService
};

var dynamo = new AWS.DynamoDB.DocumentClient(docParams);

exports.handler = function(event, context) {
    if (process.env.VERBOSE) {
        console.log('Received event:', JSON.stringify(event, null, 2));
    }
    
    var operation = event.operation;
    delete event.operation;

    switch (operation) {
        case 'create':
            dynamo.put(event, context.done);
            break;
        case 'get':
            dynamo.get(event, context.done);
            break;
        case 'update':
            dynamo.put(event, context.done);
            break;
        case 'delete':
            dynamo.delete(event, context.done);
            break;
        case 'list':
            dynamo.scan(event, context.done);
            break;
        case 'echo':
            context.succeed(event);
            break;
        case 'ping':
            context.succeed('pong');
            break;
        default:
            context.fail(new Error('Unrecognized operation "' + operation + '"'));
    }
};