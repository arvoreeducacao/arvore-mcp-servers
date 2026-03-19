# @arvoretech/mgc-mcp

MCP Server for [Magalu Cloud CLI (mgc)](https://github.com/MagaluCloud/mgccli) — manage cloud infrastructure through AI assistants.

## Prerequisites

- [MGC CLI](https://github.com/MagaluCloud/mgccli) installed and authenticated (`mgc auth login`)
- Node.js >= 20

## Configuration

Add to your MCP client config:

```json
{
  "mcpServers": {
    "mgc": {
      "command": "npx",
      "args": ["@arvoretech/mgc-mcp"]
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MGC_CLI_PATH` | Custom path to the mgc binary | `mgc` |

## Available Tools

### General
- **mgc_execute** — Run any mgc CLI command
- **mgc_auth_status** — Check authentication status

### Virtual Machines
- **mgc_vm_list** — List VM instances
- **mgc_vm_create** — Create a VM
- **mgc_vm_get** — Get VM details
- **mgc_vm_delete** — Delete a VM
- **mgc_vm_start/stop/reboot** — VM lifecycle actions
- **mgc_vm_machine_types_list** — List available machine types
- **mgc_vm_images_list** — List available OS images

### Object Storage
- **mgc_object_storage_list_buckets** — List buckets
- **mgc_object_storage_create_bucket** — Create a bucket
- **mgc_object_storage_delete_bucket** — Delete a bucket
- **mgc_object_storage_list_objects** — List objects in a bucket
- **mgc_object_storage_upload** — Upload a file

### Network
- **mgc_network_vpc_list** — List VPCs
- **mgc_network_vpc_create** — Create a VPC
- **mgc_network_subnets_list** — List subnets
- **mgc_network_public_ip_list** — List public IPs

### Kubernetes
- **mgc_kubernetes_cluster_list** — List clusters
- **mgc_kubernetes_cluster_create** — Create a cluster
- **mgc_kubernetes_get_kubeconfig** — Get kubeconfig

### Database (DBaaS)
- **mgc_dbaas_instance_list** — List database instances

### Block Storage
- **mgc_block_storage_volume_list** — List volumes
- **mgc_block_storage_volume_create** — Create a volume

## Development

```bash
pnpm install
pnpm -F @arvoretech/mgc-mcp dev
```
