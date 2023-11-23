import { IConstruct } from "constructs";

import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";

import * as lambda from "aws-cdk-lib/aws-lambda";

import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3_deployment from "aws-cdk-lib/aws-s3-deployment";
import * as cdk from "aws-cdk-lib";

import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as fs from "fs";
import { Provider } from "aws-cdk-lib/custom-resources";


/**
 * Use following Interface to define all Properties that your ServerlessApp requires!
 */
export interface ServerlessAppProps extends cdk.StackProps {
  tableName: string
  functionHandler: string
  functionPath: string
  functionName: string
  openApiPath: string
  webAppPath: string
  execDeploymentTests?: boolean
}

export class ServerlessApp extends cdk.Stack {
  constructor(scope: IConstruct, id: string, props: ServerlessAppProps) {
    super(scope, id, props);

    // Access ServerlessAppProps:

    // let foo = props.localPathToApiCode;
    // let baz = props.localPathToAppCode;

    // ### Dynamo-DB
    // ### λs && API-Gateway
    // ### S3 && CDN

    // ...


    // Dynamo
    let myTable = new dynamodb.Table(this, props.tableName, {
      tableName: props.tableName,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        type: dynamodb.AttributeType.STRING,
        name: "id",
      },
    });

    // λ-Func
    // let role = new iam.Role(this, "MyRole", {
    //   assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    // });

    // role.addManagedPolicy(
    //   iam.ManagedPolicy.fromAwsManagedPolicyName(
    //     "service-role/AWSLambdaBasicExecutionRole"
    //   )
    // );

    let fn = new lambda.Function(this, "MyFunc", {
      functionName: props.functionName,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: props.functionHandler,
      code: lambda.Code.fromAsset(
        props.functionPath
      ),
      // TODO: Parameterize <REGION>
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          "foo",
          `arn:aws:lambda:${cdk.Stack.of(this).region
          }:017000801446:layer:AWSLambdaPowertoolsPythonV2-Arm64:22`
        ),
      ],
      environment: { TABLE: myTable.tableName },
    });
    myTable.grantReadWriteData(fn);


    let fnUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    // API-Gateway
    let raw = fs
      .readFileSync(props.openApiPath)
      .toString();
    raw = raw.replace(
      /{uri}/g,
      `arn:aws:apigateway:${cdk.Stack.of(this).region
      }:lambda:path/2015-03-31/functions/arn:aws:lambda:${cdk.Stack.of(this).region
      }:${cdk.Stack.of(this).account}:function:${fn.functionName}/invocations`
    );

    let api = new apigateway.SpecRestApi(this, "rest-api", {
      apiDefinition: apigateway.ApiDefinition.fromInline(JSON.parse(raw)),
    });

    fn.addPermission("execution-permissions", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      sourceArn: api.arnForExecuteApi("*"),
    });

    // WAF
    let waf = new wafv2.CfnWebACL(this, "waf", {
      defaultAction: { allow: {} },
      scope: "REGIONAL",
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        sampledRequestsEnabled: true,
        metricName: "waf-vehicle-service",
      },
      rules: [
        {
          name: "rate-limit",
          priority: 1,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              aggregateKeyType: "IP",
              limit: 100,
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "waf-rate-limit",
          },
        },
        {
          name: "geo-match",
          priority: 2,
          action: { block: {} },
          statement: {
            geoMatchStatement: {
              countryCodes: ["US"],
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "waf-geo-match",
          },
        },
      ],
    });

    const resourceArn = `arn:${cdk.Aws.PARTITION}:apigateway:${cdk.Aws.REGION}::/restapis/${api.restApiId}/stages/${api.deploymentStage.stageName}`;

    new wafv2.CfnWebACLAssociation(this, "waf-assoc", {
      resourceArn: resourceArn,
      webAclArn: waf.attrArn,
    });

    // S3
    let website = new s3.Bucket(this, "website");

    new s3_deployment.BucketDeployment(this, "deployment", {
      destinationBucket: website,
      sources: [
        s3_deployment.Source.asset(
          props.webAppPath
        ),
      ],
    });

    // CDN
    const oai = new cloudfront.OriginAccessIdentity(this, "oai");
    website.grantRead(oai);

    new cloudfront.Distribution(this, "distribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: new origins.S3Origin(website, {
          originAccessIdentity: oai,
        }),
      },
    });

    // if (props.execDeploymentTests) {
      // Task1: Use a more complex λ running HTTP-Tests on Api-Gateway Resources!

      // Case1: Return success if Response from Api is valid
      // Case2: Return failure (throw Exception) if Response from Api is invalid!
      const test = new lambda.Function(this, "DeploymentTests", {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "index.handler",
        code: lambda.Code.fromInline(`
          exports.handler = async (event) => {
            const url = event.ResourceProperties.url
            console.log("Event: ", event);
          };
        `),
      });

      const provider = new Provider(this, "Provider", {
        onEventHandler: test,
      });
  
      const custom = new cdk.CustomResource(
        this,
        "CustomResource",
        {serviceToken: provider.serviceToken, properties: {now: Date.now(), url: "https://uu3yfodjn7.execute-api.eu-central-1.amazonaws.com"}}
      );
  
      custom.node
        .addDependency(api);
    // }
      
  }
}
