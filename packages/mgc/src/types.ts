import { z } from "zod";

export const MgcExecuteParamsSchema = z.object({
  command: z
    .string()
    .min(1, "Command is required")
    .describe(
      "The mgc CLI command to execute (without the 'mgc' prefix). Example: 'virtual-machine instances list'"
    ),
  output_format: z
    .enum(["json", "yaml", "table"])
    .optional()
    .default("json")
    .describe("Output format for the command result"),
});

export const VmListParamsSchema = z.object({
  output_format: z
    .enum(["json", "yaml", "table"])
    .optional()
    .default("json")
    .describe("Output format"),
});

export const VmCreateParamsSchema = z.object({
  name: z.string().min(1, "VM name is required").describe("Name of the VM instance"),
  machine_type: z
    .string()
    .min(1, "Machine type is required")
    .describe("Machine type (e.g., 'BV1-1-10', 'BV2-2-20')"),
  image: z
    .string()
    .min(1, "Image is required")
    .describe("Image ID or name for the VM (e.g., 'cloud-ubuntu-24.04 LTS')"),
  ssh_key_name: z
    .string()
    .optional()
    .describe("SSH key name to associate with the VM"),
});

export const VmActionParamsSchema = z.object({
  instance_id: z
    .string()
    .min(1, "Instance ID is required")
    .describe("The ID of the VM instance"),
});

export const ObjectStorageBucketParamsSchema = z.object({
  bucket_name: z
    .string()
    .min(1, "Bucket name is required")
    .describe("Name of the object storage bucket"),
});

export const ObjectStorageListObjectsParamsSchema = z.object({
  bucket_name: z
    .string()
    .min(1, "Bucket name is required")
    .describe("Name of the bucket to list objects from"),
  prefix: z.string().optional().describe("Filter objects by prefix"),
});

export const ObjectStorageUploadParamsSchema = z.object({
  bucket_name: z
    .string()
    .min(1, "Bucket name is required")
    .describe("Destination bucket name"),
  source: z.string().min(1, "Source path is required").describe("Local file path to upload"),
  destination: z.string().optional().describe("Destination key/path in the bucket"),
});

export const NetworkVpcListParamsSchema = z.object({
  output_format: z
    .enum(["json", "yaml", "table"])
    .optional()
    .default("json")
    .describe("Output format"),
});

export const NetworkVpcCreateParamsSchema = z.object({
  name: z.string().min(1, "VPC name is required").describe("Name of the VPC"),
  description: z.string().optional().describe("Description for the VPC"),
});

export const KubernetesClusterListParamsSchema = z.object({
  output_format: z
    .enum(["json", "yaml", "table"])
    .optional()
    .default("json")
    .describe("Output format"),
});

export const KubernetesClusterCreateParamsSchema = z.object({
  name: z
    .string()
    .min(1, "Cluster name is required")
    .describe("Name of the Kubernetes cluster"),
  version: z.string().optional().describe("Kubernetes version"),
  node_count: z.number().int().positive().optional().describe("Number of worker nodes"),
});

export const DbListParamsSchema = z.object({
  output_format: z
    .enum(["json", "yaml", "table"])
    .optional()
    .default("json")
    .describe("Output format"),
});

export const BlockStorageListParamsSchema = z.object({
  output_format: z
    .enum(["json", "yaml", "table"])
    .optional()
    .default("json")
    .describe("Output format"),
});

export const BlockStorageCreateParamsSchema = z.object({
  name: z.string().min(1, "Volume name is required").describe("Name of the volume"),
  size: z.number().int().positive().describe("Size in GB"),
  type: z.string().optional().describe("Volume type"),
});

export type MgcExecuteParams = z.infer<typeof MgcExecuteParamsSchema>;
export type VmListParams = z.infer<typeof VmListParamsSchema>;
export type VmCreateParams = z.infer<typeof VmCreateParamsSchema>;
export type VmActionParams = z.infer<typeof VmActionParamsSchema>;
export type ObjectStorageBucketParams = z.infer<typeof ObjectStorageBucketParamsSchema>;
export type ObjectStorageListObjectsParams = z.infer<typeof ObjectStorageListObjectsParamsSchema>;
export type ObjectStorageUploadParams = z.infer<typeof ObjectStorageUploadParamsSchema>;
export type NetworkVpcListParams = z.infer<typeof NetworkVpcListParamsSchema>;
export type NetworkVpcCreateParams = z.infer<typeof NetworkVpcCreateParamsSchema>;
export type KubernetesClusterListParams = z.infer<typeof KubernetesClusterListParamsSchema>;
export type KubernetesClusterCreateParams = z.infer<typeof KubernetesClusterCreateParamsSchema>;
export type DbListParams = z.infer<typeof DbListParamsSchema>;
export type BlockStorageListParams = z.infer<typeof BlockStorageListParamsSchema>;
export type BlockStorageCreateParams = z.infer<typeof BlockStorageCreateParamsSchema>;

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}
