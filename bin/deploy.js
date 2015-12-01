#!/usr/bin/env node

/*
 * This is a script to deploy updated AWS Lambda code for pushbot-api.
 * This will eventually be replaced with a script running inside of
 * hubot. Hubot will also be able to use the IAM role attached to the ec2
 * instance it's running in.
 * Until then, because we don't want to be using any highly-privaleged access
 * keys, this script assumes the current user has a an aws cli profile
 * set up with "aws configure". The profile name should be used as the
 * first arg to this process. E.g., `$ ./bin/deploy pushbot-deploybot`. See:
 *
 * http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html
 */

var childProcess = require('child_process');
var util = require('util');
var fs = require('fs');
var path = require('path');
var async = require('async');
var semverUtils = require('semver-utils');
var version = require('../package.json').version;
var name = require('../package.json').name;
var AWS = require('aws-sdk');
var api = require('../api');

var DEPLOY_DIR = process.env.DEPLOY_DIR || 'deploys';
var DEPLOY_BUCKET = process.env.DEPLOY_BUCKET || ('deploys.' + name);
var LAMBDA_ROLE = process.env.LAMBDA_ROLE || 'arn:aws:iam::147689183146:role/lambda_dynamo';
var AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID || '147689183146';
var API_NAME = process.env.API_NAME || 'AWS Chicago';

function createDistFolder (awsConfig, callback) {
    // Note for future reference: make sure the deployment directory
    // is a string that's not included in any
    // node_modules files or those will be excluded from the zip with
    // bad (and hard-to-pin-down) consequences.
    var zipDir = './' + DEPLOY_DIR;
    var zipPath = path.join(zipDir, 'deploy.' + version + '.zip');
    fs.stat(zipDir, function(err, stats) {
       if (err) {
           return fs.mkdir(zipDir, function(err) {
               if (err) {
                   return callback(err);
               }
               console.log('Created dist directory: ' + zipDir);
               return callback(null, awsConfig, zipPath);
           });
       }
       return callback(null, awsConfig, zipPath);
    });
}

function deleteZipFile (awsConfig, zipPath, callback) {
    fs.stat(zipPath, function (err, stats) {
        if (err) {
            // nothing to delete
            return callback(null, awsConfig, zipPath);
        }
        fs.unlink(zipPath, function (err) {
            if (err) {
                return callback(err);
            }
            return callback(null, awsConfig, zipPath);
        });
    });
}

function createZipFile (awsConfig, zipPath, callback) {

    var zipArgs = [
        '-v',
        '-r',
        zipPath,
        '.',
        '-x',
        '*tmp*',
        '*' + DEPLOY_DIR + '*',
        '*.git*'
    ];
    var procParams = {
        cd: '../',
        stdio: 'pipe'
    };
    var proc = childProcess.spawn('zip', zipArgs, procParams);
    var procErr = null;
    proc.on('exit', function (code, signal) {
        if (process.env.VERBOSE) {
            console.log('Zip Exited');
        }
        if (code === 0) {
            console.log('Created zip file...');
            return callback(null, awsConfig, zipPath);
        }
        console.log('Zip Exited with ' + code +
            '. Try re-running with VERBOSE for more details.');
        return callback(procErr);
    });
    proc.on('error', function (err) {
        console.log('Zip Error: %s', err);
        procErr = err;
    });
    proc.stdout.on('data', function (buffer) {
        if (process.env.VERBOSE) {
            console.log(buffer.toString());
        }
    });
    proc.stderr.on('data', function (buffer) {
        console.log('Error: %s', buffer.toString());
    });
}

function uploadToS3(awsConfig, zipPath, callback) {
    console.log('Uploading to S3. This is sometimes slow...');
    var s3 = new AWS.S3({
        apiVersion: '2006-03-01'
    });
    fs.stat(zipPath, function (err, stats) {
        if (err) {
            return callback(err);
        }
        if (stats.size > 50000000) {
            // this is to catch the file exclusions getting broken and
            // including prior zip files and/or the ddb-local binaries
            return callback('ZIP file is too big!! ' + stats.size);
        }
        var zipFile = fs.createReadStream(zipPath);
        var filename = path.basename(zipPath);
        var s3Params = {
            Bucket: DEPLOY_BUCKET,
            Key: filename,
            Body: zipFile,
            ContentType: 'application/zip',
            ContentLength: stats.size
        };
        s3.putObject(s3Params, function (err, data) {
            if (err) {
                return callback(util.format(
                    "Error uploading %s to s3://%s/%s\n%s",
                    filename, s3Params.Bucket, s3Params.Key, err));
            }
            var result = {
                Bucket: s3Params.Bucket,
                Key: s3Params.Key
            };
            console.log('Uploaded to s3...');
            return callback(null, result);
        });
    });
}

var LAMBDA_PREFIX = process.env.LAMBDA_PREFIX || '';

function getLambdaName(name) {
    // Use the major version in the name so that compatibility-breaking changes
    // will cause new lambdas to be created, and non-breaking changes will
    // cause lambdas to be overwritten (which should be safe).
    return LAMBDA_PREFIX + 'v' + semverUtils.parse(version).major + '_' + name;
}

function createLambda(name, s3path, callback) {
    console.log('Creating ' + getLambdaName(name));
    var lambda = new AWS.Lambda({apiVersion: '2015-03-31'});
    var lambdaParams = {
        Code: {
            S3Bucket: s3path.Bucket,
            S3Key: s3path.Key
        },
        FunctionName: getLambdaName(name),
        Handler: 'index.' + name,
        Role: LAMBDA_ROLE,
        Runtime: 'nodejs',
        Description: API_NAME + ' API ' + name + ' v' + version,
        MemorySize: 128,
        Timeout: 5
    };
    lambda.createFunction(lambdaParams, function (err, result) {
        if (err) {
            return callback(err);
        }
        console.log('Created ' + result.FunctionArn);
        callback(null, result);
    });
}

function updateLambda(name, s3path, callback) {
    var functionName = getLambdaName(name);
    console.log('Updating ' + functionName);
    var lambda = new AWS.Lambda({apiVersion: '2015-03-31'});
    var lambdaParams = {
        S3Bucket: s3path.Bucket,
        S3Key: s3path.Key,
        FunctionName: functionName
    };
    lambda.updateFunctionCode(lambdaParams, function (err, result) {
        if (err) {
            return callback(err);
        }
        console.log('Updated ' + result.FunctionArn);
        // Update the version in the Description as well
        lambdaParams = {
            FunctionName: functionName,
            Description: API_NAME + ' API ' + name + ' v' + version,
        };
        lambda.updateFunctionConfiguration(lambdaParams, function (err, data) {
            if (err) {
                return callback(err);
            }
            lambdaParams = {
                Action: 'lambda:InvokeFunction',
                FunctionName: functionName,
                Principal: "apigateway.amazonaws.com",
                StatementId: 'Allow_Api_Gateway',
                SourceAccount: AWS_ACCOUNT_ID
            };
            lambda.addPermission(lambdaParams, function(err, data) {
                if (err) {
                    return callback(err);
                }
                return callback(null, result);
            });
        });
    });
}

function updateLambdas(s3path, callback) {
    var functions = Object.keys(api);
    var lambda = new AWS.Lambda({apiVersion: '2015-03-31'});
    // AWS throws a TooManyRequestsException if we update too many
    // lambdas at once. So let's slow it down...
    async.eachSeries(functions, function (name, done) {
        var functionName = getLambdaName(name);
        var lambdaParams = {
            FunctionName: functionName
        };
        lambda.getFunction(lambdaParams, function (err, result) {
            if (err) {
                if (err.code === 'ResourceNotFoundException') {
                    return createLambda(name, s3path, done);
                }
                return done(err);
            }
            updateLambda(name, s3path, done);
        });
    }, callback);
}

async.waterfall([
    createDistFolder,
    deleteZipFile,
    createZipFile,
    uploadToS3,
    updateLambdas
], function (err, result) {
    if (err) {
        return console.log(err);
    }
});
