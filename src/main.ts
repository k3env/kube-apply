import * as k8s from '@kubernetes/client-node';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

type KubernetesObjectHeader<T extends k8s.KubernetesObject | k8s.KubernetesObject> = Pick<T, 'apiVersion' | 'kind'> & {
  metadata: {
    name: string;
    namespace: string;
  };
};

async function apply(template: string, vars?: Record<string, string>): Promise<(k8s.V1ObjectMeta | undefined)[]> {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();

  const client = k8s.KubernetesObjectApi.makeApiClient(kc);

  const specString = fs.readFileSync(template, 'utf8');
  let specs = yaml.loadAll(specString) as k8s.KubernetesObject[];
  let json = JSON.stringify(specs, undefined, 2);
  for (const v in vars) {
    json = json.replaceAll(`$.${v}`, vars[v]);
  }
  specs = JSON.parse(json);
  const validSpecs = specs.filter((s) => s && s.kind && s.metadata);
  const created: (k8s.V1ObjectMeta | undefined)[] = [];
  for (const spec of validSpecs) {
    // this is to convince the old version of TypeScript that metadata exists even though we already filtered specs
    // without metadata out
    spec.metadata = spec.metadata || {};
    spec.metadata.annotations = spec.metadata.annotations || {};
    delete spec.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'];
    spec.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'] = JSON.stringify(spec);
    try {
      // try to get the resource, if it does not exist an error will be thrown and we will end up in the catch
      // block.
      const meta = spec as KubernetesObjectHeader<k8s.KubernetesObject>;
      await client.read(meta);
      // we got the resource, so it exists, so patch it
      //
      // Note that this could fail if the spec refers to a custom resource. For custom resources you may need
      // to specify a different patch merge strategy in the content-type header.
      //
      // See: https://github.com/kubernetes/kubernetes/issues/97423
      const response = await client.patch(spec);
      created.push(response.body.metadata);
    } catch (e) {
      // we did not get the resource, so it does not exist, so create it
      const response = await client.create(spec);
      created.push(response.body.metadata);
    }
  }
  return created;
}

const pluginEnv: Record<string, string> = {};
for (const e in process.env) {
  if (e.startsWith('PLUGIN_')) pluginEnv[e] = process.env[e] ?? '';
}

const template = pluginEnv['PLUGIN_TEMPLATE'];
const vars = JSON.parse(pluginEnv['PLUGIN_VARS']);

console.log('vars', vars);
console.log('template', template);

apply(template, vars);

// console.log(JSON.stringify(pluginEnv));
