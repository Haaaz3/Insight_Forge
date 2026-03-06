package com.algoaccel.hcc.service;

import com.algoaccel.hcc.model.HccSuspectRule;
import com.algoaccel.hcc.model.enums.HccRuleStatus;
import com.algoaccel.hcc.repository.HccSuspectRuleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class HccRuleServiceTest {

    @Autowired
    private HccRuleService hccRuleService;

    @Autowired
    private HccSuspectRuleRepository ruleRepository;

    @BeforeEach
    void setUp() {
        ruleRepository.deleteAll();
    }

    @Test
    void shouldCreateAndRetrieveRule() {
        // Create a rule
        HccSuspectRule rule = HccSuspectRule.builder()
                .name("HIV/AIDS Suspecting Rule")
                .hccCategory("HCC 1")
                .conditionName("HIV/AIDS")
                .cmsEnabled(true)
                .hhsEnabled(true)
                .esrdEnabled(true)
                .status(HccRuleStatus.DRAFT)
                .modelYear("v28")
                .lookbackYears(2)
                .build();

        // Save it
        HccSuspectRule saved = hccRuleService.save(rule);
        assertNotNull(saved.getId());

        // Retrieve it
        Optional<HccSuspectRule> retrieved = hccRuleService.findById(saved.getId());
        assertTrue(retrieved.isPresent());
        assertEquals("HIV/AIDS Suspecting Rule", retrieved.get().getName());
        assertEquals("HCC 1", retrieved.get().getHccCategory());
        assertEquals("HIV/AIDS", retrieved.get().getConditionName());
        assertEquals(HccRuleStatus.DRAFT, retrieved.get().getStatus());
        assertEquals("v28", retrieved.get().getModelYear());
        assertEquals(2, retrieved.get().getLookbackYears());
    }

    @Test
    void shouldUpdateRule() {
        // Create a rule
        HccSuspectRule rule = HccSuspectRule.builder()
                .name("Original Name")
                .hccCategory("HCC 1")
                .conditionName("HIV/AIDS")
                .status(HccRuleStatus.DRAFT)
                .build();

        HccSuspectRule saved = hccRuleService.save(rule);

        // Update it
        HccSuspectRule update = HccSuspectRule.builder()
                .name("Updated Name")
                .hccCategory("HCC 1")
                .conditionName("HIV/AIDS")
                .status(HccRuleStatus.IN_REVIEW)
                .cmsEnabled(true)
                .hhsEnabled(false)
                .esrdEnabled(true)
                .modelYear("v29")
                .lookbackYears(3)
                .build();

        HccSuspectRule updated = hccRuleService.update(saved.getId(), update);

        assertEquals("Updated Name", updated.getName());
        assertEquals(HccRuleStatus.IN_REVIEW, updated.getStatus());
        assertFalse(updated.getHhsEnabled());
        assertEquals("v29", updated.getModelYear());
        assertEquals(3, updated.getLookbackYears());
    }

    @Test
    void shouldDeleteRule() {
        HccSuspectRule rule = HccSuspectRule.builder()
                .name("Rule to Delete")
                .hccCategory("HCC 1")
                .conditionName("HIV/AIDS")
                .status(HccRuleStatus.DRAFT)
                .build();

        HccSuspectRule saved = hccRuleService.save(rule);
        Long id = saved.getId();

        hccRuleService.delete(id);

        Optional<HccSuspectRule> deleted = hccRuleService.findById(id);
        assertFalse(deleted.isPresent());
    }

    @Test
    void shouldFindAllRules() {
        HccSuspectRule rule1 = HccSuspectRule.builder()
                .name("Rule 1")
                .hccCategory("HCC 1")
                .conditionName("Condition 1")
                .status(HccRuleStatus.DRAFT)
                .build();

        HccSuspectRule rule2 = HccSuspectRule.builder()
                .name("Rule 2")
                .hccCategory("HCC 2")
                .conditionName("Condition 2")
                .status(HccRuleStatus.PUBLISHED)
                .build();

        hccRuleService.save(rule1);
        hccRuleService.save(rule2);

        assertEquals(2, hccRuleService.findAll().size());
    }
}
