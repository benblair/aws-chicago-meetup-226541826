/*
 * Mock of AWS Lambda for testing
 */

var uuid = require('node-uuid');
var async = require('async');

var LambdaMock = function (params) {
    params = params || {};
    this.region = params.region || 'us-test-1';
    this.memory_size = params.memory_size || "128";
    this.timeout = params.lambda_timeout || 5000;
};

LambdaMock.prototype.invoke = function (module, functionName, request, callback) {
    var self = this;
    var startTime = Date.now();
    // Serialize request so any writes to it aren't passed by reference back to the tests.
    var requestCopy = JSON.parse(JSON.stringify(request));
    var context = {
        "awsRequestId": uuid.v4(),
        "invokeid": uuid.v4(),
        "logGroupName": "/aws/lambda/" + functionName,
        "logStreamName": "2015/09/10/[HEAD]1234",
        "functionName": functionName,
        "memoryLimitInMB": self.memory_size,
        "functionVersion": "HEAD",
        "isDefaultFunctionVersion": true,
        done: callback,
        succeed: function (result) { callback(null, result); },
        fail: function(err) { callback(err); },
        getRemainingTimeInMillis: function () { return Date.now() - startTime; }
    };
    process.env.AWS_LAMBDA_LOG_GROUP_NAME = "/aws/lambda/" + functionName;
    process.env.AWS_LAMBDA_FUNCTION_NAME = functionName;
    module[functionName](requestCopy, context);
};

/*
 * Invoke a set of lambda calls in series. calls is an array of
 * objects with { module, functionName, request(), callback(err, request, result, done) } fields
 */

LambdaMock.prototype.invokeSeries = function (calls, callback) {
    var self = this;
    async.eachSeries(calls, function (call, done) {
        var request = call.request();
        self.invoke(call.module, call.functionName, request, function (err, result) {
            call.callback(err, request, result, done);
        });
    }, callback);
};

/*
 * Invoke a set of lambda calls in parallel. calls is an array of
 * objects with { moduel, functionName, request(), callback(err, request, result, done) } fields
 */

LambdaMock.prototype.invokeParallel = function (calls, callback) {
    var self = this;
    async.each(calls, function (call, done) {
        var request = call.request();
        self.invoke(call.module, call.functionName, request, function (err, result) {
            call.callback(err, request, result, done);
        });
    }, callback);
};

module.exports = LambdaMock;
