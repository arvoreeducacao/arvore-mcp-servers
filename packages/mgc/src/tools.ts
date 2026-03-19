import { MgcClient } from "./mgc-client.js";
import {
  MgcExecuteParams,
  VmListParams,
  VmCreateParams,
  VmActionParams,
  ObjectStorageBucketParams,
  ObjectStorageListObjectsParams,
  ObjectStorageUploadParams,
  NetworkVpcListParams,
  NetworkVpcCreateParams,
  KubernetesClusterListParams,
  KubernetesClusterCreateParams,
  DbListParams,
  BlockStorageListParams,
  BlockStorageCreateParams,
  McpToolResult,
} from "./types.js";

export class MgcTools {
  constructor(private client: MgcClient) {}

  private formatResult(
    stdout: string,
    stderr: string,
    exitCode: number
  ): McpToolResult {
    if (exitCode !== 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: true,
                exitCode,
                stderr: stderr.trim(),
                stdout: stdout.trim(),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: stdout.trim() || stderr.trim() || "Command completed successfully",
        },
      ],
    };
  }

  async execute(params: MgcExecuteParams): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      params.command,
      params.output_format
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  // Virtual Machine tools
  async vmList(params: VmListParams): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      "virtual-machine instances list",
      params.output_format
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  async vmCreate(params: VmCreateParams): Promise<McpToolResult> {
    let cmd = `virtual-machine instances create --name ${params.name} --machine-type.name ${params.machine_type} --image.name ${params.image}`;
    if (params.ssh_key_name) {
      cmd += ` --ssh-key-name ${params.ssh_key_name}`;
    }
    const result = await this.client.executeCommand(cmd, "json");
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  async vmGet(params: VmActionParams): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      `virtual-machine instances get --id ${params.instance_id}`,
      "json"
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  async vmDelete(params: VmActionParams): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      `virtual-machine instances delete --id ${params.instance_id}`
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  async vmStart(params: VmActionParams): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      `virtual-machine instances start --id ${params.instance_id}`
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  async vmStop(params: VmActionParams): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      `virtual-machine instances stop --id ${params.instance_id}`
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  async vmReboot(params: VmActionParams): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      `virtual-machine instances reboot --id ${params.instance_id}`
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  // Object Storage tools
  async objectStorageListBuckets(params: VmListParams): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      "object-storage buckets list",
      params.output_format
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  async objectStorageCreateBucket(
    params: ObjectStorageBucketParams
  ): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      `object-storage buckets create --name ${params.bucket_name}`,
      "json"
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  async objectStorageDeleteBucket(
    params: ObjectStorageBucketParams
  ): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      `object-storage buckets delete --name ${params.bucket_name}`
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  async objectStorageListObjects(
    params: ObjectStorageListObjectsParams
  ): Promise<McpToolResult> {
    let cmd = `object-storage objects list --dst ${params.bucket_name}`;
    if (params.prefix) {
      cmd += ` --prefix ${params.prefix}`;
    }
    const result = await this.client.executeCommand(cmd, "json");
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  async objectStorageUpload(
    params: ObjectStorageUploadParams
  ): Promise<McpToolResult> {
    let cmd = `object-storage objects upload --src ${params.source} --dst ${params.bucket_name}`;
    if (params.destination) {
      cmd += `/${params.destination}`;
    }
    const result = await this.client.executeCommand(cmd, "json");
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  // Network tools
  async networkVpcList(params: NetworkVpcListParams): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      "network vpcs list",
      params.output_format
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  async networkVpcCreate(params: NetworkVpcCreateParams): Promise<McpToolResult> {
    let cmd = `network vpcs create --name ${params.name}`;
    if (params.description) {
      cmd += ` --description ${params.description}`;
    }
    const result = await this.client.executeCommand(cmd, "json");
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  async networkSubnetsList(params: VmListParams): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      "network subnets list",
      params.output_format
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  async networkPublicIpList(params: VmListParams): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      "network public-ips list",
      params.output_format
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  // Kubernetes tools
  async kubernetesClusterList(
    params: KubernetesClusterListParams
  ): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      "kubernetes cluster list",
      params.output_format
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  async kubernetesClusterCreate(
    params: KubernetesClusterCreateParams
  ): Promise<McpToolResult> {
    let cmd = `kubernetes cluster create --name ${params.name}`;
    if (params.version) {
      cmd += ` --version ${params.version}`;
    }
    if (params.node_count) {
      cmd += ` --node-count ${params.node_count}`;
    }
    const result = await this.client.executeCommand(cmd, "json");
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  async kubernetesGetKubeconfig(params: VmActionParams): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      `kubernetes cluster kubeconfig --id ${params.instance_id}`
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  // DBaaS tools
  async dbaasInstanceList(params: DbListParams): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      "dbaas instances list",
      params.output_format
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  // Block Storage tools
  async blockStorageVolumeList(
    params: BlockStorageListParams
  ): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      "block-storage volumes list",
      params.output_format
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  async blockStorageVolumeCreate(
    params: BlockStorageCreateParams
  ): Promise<McpToolResult> {
    let cmd = `block-storage volumes create --name ${params.name} --size ${params.size}`;
    if (params.type) {
      cmd += ` --type ${params.type}`;
    }
    const result = await this.client.executeCommand(cmd, "json");
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  // Auth tools
  async authStatus(): Promise<McpToolResult> {
    const result = await this.client.executeCommand("auth access-token");
    if (result.exitCode === 0) {
      return {
        content: [
          {
            type: "text",
            text: "Authentication is active. Access token retrieved successfully.",
          },
        ],
      };
    }
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  // Machine types and images (useful for VM creation)
  async vmMachineTypesList(params: VmListParams): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      "virtual-machine machine-types list",
      params.output_format
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }

  async vmImagesList(params: VmListParams): Promise<McpToolResult> {
    const result = await this.client.executeCommand(
      "virtual-machine images list",
      params.output_format
    );
    return this.formatResult(result.stdout, result.stderr, result.exitCode);
  }
}
