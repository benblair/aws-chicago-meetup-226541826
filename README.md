# aws-chicago-meetup-226541826
Code for a talk on Lambda &amp; API Gateway at the Dec 2, 2015 AWS Chicago Meetup


## Manual Build in the AWS Console

### Create the dynamodb table

1. Create a table named `cats` with a string hash key `name`
2. Accept all other defaults and create the table

### Create the lambda function

1. Create a new function using the `simple-mobile-backend` template
2. Create the suggested `Basic with DynamoDB` role if it doesn't already exist
3. Name it `cats`

Note that this lambda function multiplexes operations based on the body. It
doesn't have to work that way.


### Test out some lambda invocations:

Create a cat:
```JSON
{
  "operation": "create",
  "TableName": "cats",
  "Item": {
      "name": "henry",
      "status": "hungry"
  }
}
```

Get a cat:
```JSON
{
  "operation": "read",
  "TableName": "cats",
  "Key": {
      "name": "henry"
  }
}
```

List all cats:
```JSON
{
  "operation": "read",
  "TableName": "cats",
  "Key": {
      "name": "henry"
  }
}
```


Update a cat:
```JSON
{
  "operation": "create",
  "TableName": "cats",
  "Item": {
      "name": "henry",
      "status": "sleepy"
  }
}
```

### Create a new API Gateway API

1. Name it `MeetupCats`
2. Create a new `/cats` resource
3. Create a new `/{name}` resource under `/cats`
4. Create the following methods with the corresponding mapping templates:

#### POST /cats

```JSON
{
  "operation": "create",
  "TableName": "cats",
  "Item": $input.json('$')
}
```

#### GET /cats

```JSON
{
    "operation": "list",
    "TableName": "cats"
}
```

#### GET /cats/{name}

```JSON
{
    "operation": "read",
    "TableName": "cats",
    "Key": {
        "name": "$input.params('name')"
    }
}
```

#### PUT /cats/{name}

```JSON
{
    "operation": "create",
    "TableName": "cats",
    "Item": {
        "name": "$input.params('name')",
        "status": "$input.path('$.status')"
    }
}
```