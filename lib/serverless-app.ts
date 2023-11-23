import { IConstruct } from "constructs";

import * as origins    from "aws-cdk-lib/aws-cloudfront-origins";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as apigateway from "aws-cdk-lib/aws-apigateway";

import * as lambda from "aws-cdk-lib/aws-lambda";

import * as s3_deployment from "aws-cdk-lib/aws-s3-deployment";
import * as s3            from "aws-cdk-lib/aws-s3";

import * as cdk from "aws-cdk-lib";

/**
 * Use following Interface to define all Properties that your ServerlessApp requires!
 */
export interface ServerlessAppProps extends cdk.StackProps {
  localPathToApiCode: string;
  localPathToAppCode: string;

  // ...
}

export class ServerlessApp extends cdk.Stack {
  constructor(scope: IConstruct, id: string, props: ServerlessAppProps) {
    super(scope, id, props);

    // Access ServerlessAppProps:

    // let foo = props.localPathToApiCode;
    // let baz = props.localPathToAppCode;


    // ### Dynamo-DB

    // ...

    // ### λ && API-Gateway

    // ...

    // ### S3 && CDN

    // S3-Bucket
    // S3-Bucket Deployment
    // OAI
    // CDN
  }
}
