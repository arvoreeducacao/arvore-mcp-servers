import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MgcClient } from "./mgc-client.js";
import { MgcTools } from "./tools.js";
import {
  MgcExecuteParamsSchema,
  VmListParamsSchema,
  VmCreateParamsSchema,
  VmActionParamsSchema,
  ObjectStorageBucketParamsSchema,
  ObjectStorageListObjectsParamsSchema,
  ObjectStorageUploadParamsSchema,
  NetworkVpcListParamsSchema,
  NetworkVpcCreateParamsSchema,
  KubernetesClusterListParamsSchema,
  KubernetesClusterCreateParamsSchema,
  DbListParamsSchema,
  BlockStorageListParamsSchema,
  BlockStorageCreateParamsSchema,
  SearchDocsParamsSchema,
  GetDocParamsSchema,
} from "./types.js";

export class MgcMCPServer {
  private server: McpServer;
  private tools: MgcTools;

  constructor(mgcPath?: string) {
    this.server = new McpServer({
      name: "mgc-mcp-server",
      version: "1.0.0",
    });

    const client = new MgcClient({ mgcPath });
    const docsDir = process.env.MAGALU_DOCS_DIR;
    this.tools = new MgcTools(client, docsDir);

    this.setupTools();
  }

  private setupTools(): void {
    // Generic execute - run any mgc command
    this.server.registerTool(
      "mgc_execute",
      {
        title: "Execute MGC Command",
        description:
          "Execute any Magalu Cloud CLI command. Use this for commands not covered by specific tools, or for advanced operations. The command should NOT include the 'mgc' prefix.",
        inputSchema: MgcExecuteParamsSchema.shape,
      },
      async (params) => {
        const validated = MgcExecuteParamsSchema.parse(params);
        return this.tools.execute(validated);
      }
    );

    // Auth
    this.server.registerTool(
      "mgc_auth_status",
      {
        title: "Check Auth Status",
        description:
          "Check if the MGC CLI is authenticated and the current session is valid",
        inputSchema: {},
      },
      async () => {
        return this.tools.authStatus();
      }
    );

    // Virtual Machine tools
    this.server.registerTool(
      "mgc_vm_list",
      {
        title: "List Virtual Machines",
        description: "List all virtual machine instances in your Magalu Cloud account",
        inputSchema: VmListParamsSchema.shape,
      },
      async (params) => {
        const validated = VmListParamsSchema.parse(params);
        return this.tools.vmList(validated);
      }
    );

    this.server.registerTool(
      "mgc_vm_create",
      {
        title: "Create Virtual Machine",
        description:
          "Create a new virtual machine instance. Use mgc_vm_machine_types_list and mgc_vm_images_list to discover available options.",
        inputSchema: VmCreateParamsSchema.shape,
      },
      async (params) => {
        const validated = VmCreateParamsSchema.parse(params);
        return this.tools.vmCreate(validated);
      }
    );

    this.server.registerTool(
      "mgc_vm_get",
      {
        title: "Get Virtual Machine Details",
        description: "Get detailed information about a specific virtual machine instance",
        inputSchema: VmActionParamsSchema.shape,
      },
      async (params) => {
        const validated = VmActionParamsSchema.parse(params);
        return this.tools.vmGet(validated);
      }
    );

    this.server.registerTool(
      "mgc_vm_delete",
      {
        title: "Delete Virtual Machine",
        description: "Delete a virtual machine instance permanently",
        inputSchema: VmActionParamsSchema.shape,
      },
      async (params) => {
        const validated = VmActionParamsSchema.parse(params);
        return this.tools.vmDelete(validated);
      }
    );

    this.server.registerTool(
      "mgc_vm_start",
      {
        title: "Start Virtual Machine",
        description: "Start a stopped virtual machine instance",
        inputSchema: VmActionParamsSchema.shape,
      },
      async (params) => {
        const validated = VmActionParamsSchema.parse(params);
        return this.tools.vmStart(validated);
      }
    );

    this.server.registerTool(
      "mgc_vm_stop",
      {
        title: "Stop Virtual Machine",
        description: "Stop a running virtual machine instance",
        inputSchema: VmActionParamsSchema.shape,
      },
      async (params) => {
        const validated = VmActionParamsSchema.parse(params);
        return this.tools.vmStop(validated);
      }
    );

    this.server.registerTool(
      "mgc_vm_reboot",
      {
        title: "Reboot Virtual Machine",
        description: "Reboot a virtual machine instance",
        inputSchema: VmActionParamsSchema.shape,
      },
      async (params) => {
        const validated = VmActionParamsSchema.parse(params);
        return this.tools.vmReboot(validated);
      }
    );

    this.server.registerTool(
      "mgc_vm_machine_types_list",
      {
        title: "List VM Machine Types",
        description:
          "List available machine types (sizes) for virtual machines",
        inputSchema: VmListParamsSchema.shape,
      },
      async (params) => {
        const validated = VmListParamsSchema.parse(params);
        return this.tools.vmMachineTypesList(validated);
      }
    );

    this.server.registerTool(
      "mgc_vm_images_list",
      {
        title: "List VM Images",
        description: "List available OS images for virtual machine creation",
        inputSchema: VmListParamsSchema.shape,
      },
      async (params) => {
        const validated = VmListParamsSchema.parse(params);
        return this.tools.vmImagesList(validated);
      }
    );

    // Object Storage tools
    this.server.registerTool(
      "mgc_object_storage_list_buckets",
      {
        title: "List Object Storage Buckets",
        description: "List all S3-compatible object storage buckets",
        inputSchema: VmListParamsSchema.shape,
      },
      async (params) => {
        const validated = VmListParamsSchema.parse(params);
        return this.tools.objectStorageListBuckets(validated);
      }
    );

    this.server.registerTool(
      "mgc_object_storage_create_bucket",
      {
        title: "Create Object Storage Bucket",
        description: "Create a new S3-compatible object storage bucket",
        inputSchema: ObjectStorageBucketParamsSchema.shape,
      },
      async (params) => {
        const validated = ObjectStorageBucketParamsSchema.parse(params);
        return this.tools.objectStorageCreateBucket(validated);
      }
    );

    this.server.registerTool(
      "mgc_object_storage_delete_bucket",
      {
        title: "Delete Object Storage Bucket",
        description: "Delete an object storage bucket",
        inputSchema: ObjectStorageBucketParamsSchema.shape,
      },
      async (params) => {
        const validated = ObjectStorageBucketParamsSchema.parse(params);
        return this.tools.objectStorageDeleteBucket(validated);
      }
    );

    this.server.registerTool(
      "mgc_object_storage_list_objects",
      {
        title: "List Objects in Bucket",
        description: "List objects within an object storage bucket",
        inputSchema: ObjectStorageListObjectsParamsSchema.shape,
      },
      async (params) => {
        const validated = ObjectStorageListObjectsParamsSchema.parse(params);
        return this.tools.objectStorageListObjects(validated);
      }
    );

    this.server.registerTool(
      "mgc_object_storage_upload",
      {
        title: "Upload Object to Bucket",
        description: "Upload a file to an object storage bucket",
        inputSchema: ObjectStorageUploadParamsSchema.shape,
      },
      async (params) => {
        const validated = ObjectStorageUploadParamsSchema.parse(params);
        return this.tools.objectStorageUpload(validated);
      }
    );

    // Network tools
    this.server.registerTool(
      "mgc_network_vpc_list",
      {
        title: "List VPCs",
        description: "List all Virtual Private Clouds (VPCs)",
        inputSchema: NetworkVpcListParamsSchema.shape,
      },
      async (params) => {
        const validated = NetworkVpcListParamsSchema.parse(params);
        return this.tools.networkVpcList(validated);
      }
    );

    this.server.registerTool(
      "mgc_network_vpc_create",
      {
        title: "Create VPC",
        description: "Create a new Virtual Private Cloud",
        inputSchema: NetworkVpcCreateParamsSchema.shape,
      },
      async (params) => {
        const validated = NetworkVpcCreateParamsSchema.parse(params);
        return this.tools.networkVpcCreate(validated);
      }
    );

    this.server.registerTool(
      "mgc_network_subnets_list",
      {
        title: "List Subnets",
        description: "List all network subnets",
        inputSchema: VmListParamsSchema.shape,
      },
      async (params) => {
        const validated = VmListParamsSchema.parse(params);
        return this.tools.networkSubnetsList(validated);
      }
    );

    this.server.registerTool(
      "mgc_network_public_ip_list",
      {
        title: "List Public IPs",
        description: "List all public IP addresses",
        inputSchema: VmListParamsSchema.shape,
      },
      async (params) => {
        const validated = VmListParamsSchema.parse(params);
        return this.tools.networkPublicIpList(validated);
      }
    );

    // Kubernetes tools
    this.server.registerTool(
      "mgc_kubernetes_cluster_list",
      {
        title: "List Kubernetes Clusters",
        description: "List all managed Kubernetes clusters",
        inputSchema: KubernetesClusterListParamsSchema.shape,
      },
      async (params) => {
        const validated = KubernetesClusterListParamsSchema.parse(params);
        return this.tools.kubernetesClusterList(validated);
      }
    );

    this.server.registerTool(
      "mgc_kubernetes_cluster_create",
      {
        title: "Create Kubernetes Cluster",
        description: "Create a new managed Kubernetes cluster",
        inputSchema: KubernetesClusterCreateParamsSchema.shape,
      },
      async (params) => {
        const validated = KubernetesClusterCreateParamsSchema.parse(params);
        return this.tools.kubernetesClusterCreate(validated);
      }
    );

    this.server.registerTool(
      "mgc_kubernetes_get_kubeconfig",
      {
        title: "Get Kubeconfig",
        description: "Retrieve the kubeconfig for a Kubernetes cluster",
        inputSchema: VmActionParamsSchema.shape,
      },
      async (params) => {
        const validated = VmActionParamsSchema.parse(params);
        return this.tools.kubernetesGetKubeconfig(validated);
      }
    );

    // DBaaS tools
    this.server.registerTool(
      "mgc_dbaas_instance_list",
      {
        title: "List Database Instances",
        description: "List all managed database (DBaaS) instances",
        inputSchema: DbListParamsSchema.shape,
      },
      async (params) => {
        const validated = DbListParamsSchema.parse(params);
        return this.tools.dbaasInstanceList(validated);
      }
    );

    // Block Storage tools
    this.server.registerTool(
      "mgc_block_storage_volume_list",
      {
        title: "List Block Storage Volumes",
        description: "List all block storage volumes",
        inputSchema: BlockStorageListParamsSchema.shape,
      },
      async (params) => {
        const validated = BlockStorageListParamsSchema.parse(params);
        return this.tools.blockStorageVolumeList(validated);
      }
    );

    this.server.registerTool(
      "mgc_block_storage_volume_create",
      {
        title: "Create Block Storage Volume",
        description: "Create a new block storage volume",
        inputSchema: BlockStorageCreateParamsSchema.shape,
      },
      async (params) => {
        const validated = BlockStorageCreateParamsSchema.parse(params);
        return this.tools.blockStorageVolumeCreate(validated);
      }
    );

    this.server.registerTool(
      "search_magalu_docs",
      {
        title: "Search Magalu Documentation",
        description:
          "Semantic search across Magalu Cloud developer documentation. Returns relevant doc pages with snippets and links. Requires MAGALU_DOCS_DIR env var pointing to scraped docs.",
        inputSchema: SearchDocsParamsSchema.shape,
      },
      async (params) => {
        const validated = SearchDocsParamsSchema.parse(params);
        return this.tools.searchDocs(validated);
      }
    );

    this.server.registerTool(
      "get_magalu_doc",
      {
        title: "Get Magalu Doc Content",
        description:
          "Get the full markdown content of a specific Magalu documentation page by filepath. Use search_magalu_docs first to find the filepath.",
        inputSchema: GetDocParamsSchema.shape,
      },
      async (params) => {
        const validated = GetDocParamsSchema.parse(params);
        return this.tools.getDoc(validated);
      }
    );
  }

  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("MGC MCP Server started successfully");
    } catch (error) {
      console.error(
        "Failed to start MGC MCP Server:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  }

  setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      console.error(`Received ${signal}, shutting down gracefully...`);
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("uncaughtException", async (error) => {
      console.error("Uncaught exception:", error);
      process.exit(1);
    });
    process.on("unhandledRejection", async (reason) => {
      console.error("Unhandled rejection:", reason);
      process.exit(1);
    });
  }
}
