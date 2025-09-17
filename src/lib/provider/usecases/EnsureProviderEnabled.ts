import { providerRepository } from "../ProviderRepository";
import { AVAILABLE_PROVIDERS_CATALOG } from "../catalog";
import { ProviderStatus, type ProviderEntity } from "../types";
import { modelRepository } from "../ModelRepository";
import { getStaticModels, type ProviderName } from "../staticModels";
import { syncDynamicProviders } from "@/lib/llm";

/**
 * 确保指定内置 Provider 已存在且在 UI 中可见。
 * - 若不存在：按目录默认值创建，并写入静态模型
 * - 若已存在：设置为可见
 */
export class EnsureProviderEnabledUseCase {
  async execute(name: string): Promise<void> {
    const list = await providerRepository.getAll();
    const existing = list.find(p => p.name === name);
    if (!existing) {
      const def = AVAILABLE_PROVIDERS_CATALOG.find(d => d.name === name);
      const url = def?.defaultUrl || "";
      const requiresKey = def?.requiresKey ?? (name !== 'Ollama');
      const entity: ProviderEntity = {
        name,
        displayName: name,
        url,
        requiresKey,
        status: requiresKey ? ProviderStatus.NO_KEY : ProviderStatus.UNKNOWN,
        lastChecked: 0,
        apiKey: null,
        isUserAdded: true,
        isVisible: true,
        strategy: def?.strategy,
      } as ProviderEntity;
      await providerRepository.upsert(entity);

      const staticList = getStaticModels(name as ProviderName);
      if (staticList?.length) {
        await modelRepository.save(
          name,
          staticList.map((m)=>({ provider: name, name: m.id, label: m.label, aliases: [m.id] })) as any
        );
      }
    } else {
      await providerRepository.setVisibility(name, true);
    }

    await syncDynamicProviders();
  }
}

export const ensureProviderEnabledUseCase = new EnsureProviderEnabledUseCase();


